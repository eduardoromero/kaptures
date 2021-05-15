const {handlerWithXRayContext, AWSXRay} = require("@architect/shared/tracing");
const {initialize} = require('@architect/shared/logger');
const arc = require('@architect/functions');
const {v4: uuidv4} = require('uuid');

const OPERATION = "GAME_UPDATES";
const TYPE = 'EVENT';
const ctx = {
    operation: OPERATION,
    type: TYPE,
}
let data;
let logger;
let awsRequestId;

function buildCategoryKey(categoryName) {
    return {
        PK: 'category',
        categoryGameTs: `##CATEGORY#${categoryName}`
    }
}

function buildCategoryGameKey(categoryName, gameId) {
    // get a daily timestamp, making games update only daily, and avoiding dupes when a game updates too often.
    // duplicates are still happening, just not daily

    const ts = (new Date()).toJSON().split("T")[0];
    return {
        PK: 'category',
        categoryGameTs: `${categoryName}#${ts}#${gameId}`
    }
}

async function createCategory(categoryName) {
    logger.info({category: categoryName}, `Creating category ${categoryName}`);

    try {
        const key = buildCategoryKey(categoryName);
        const category = {
            ...key,
            _type: 'categories',
            category: categoryName,
            created: (new Date()).toJSON()
        };

        logger.info({category}, `Category: ${categoryName}`);
        // going via the low-level DynamoDB DocumentClient because of composite key
        const params = {Key: key, Item: category, TableName: data._name("categories")};
        logger.debug({params}, "Update Category Query");
        await data._doc.put(params).promise();

        logger.info({category}, `Created ${categoryName} category successfully`);
        return category;
    } catch (error) {
        logger.error({
            error,
            stack: error.stack
        }, `There was an error when attempting to create category: ${categoryName}`);
    }
}


async function createCategoryGame(categoryName, game) {
    const subsegment = AWSXRay.getSegment().addNewSubsegment('##DDB.UpdateCategoryGame');
    subsegment.addAnnotation('gameId', game.id);
    subsegment.addAnnotation('category', categoryName);

    logger.info({category: categoryName}, `Creating category ${categoryName}`);

    const categoryGameKey = buildCategoryGameKey(categoryName, game.id);
    const entry = {
        ...categoryGameKey,
        game: game.id,
        title: game.name,
        category: categoryName,
        platforms: game.platforms,
        updated: (new Date).toJSON(),
    }

    subsegment.addMetadata('entry', entry);

    // going via the low-level DynamoDB DocumentClient because of composite key
    const params = {Key: categoryGameKey, Item: entry, TableName: data._name("categories")};
    logger.debug({params}, "Update CategoryGame Query");

    return data._doc.put(params).promise();
}

async function updateCategory(categoryName, game) {
    const subsegment = AWSXRay.getSegment().addNewSubsegment('##DDB.UpdateCategory');
    subsegment.addAnnotation('gameId', game.id);
    subsegment.addAnnotation('category', categoryName);

    try {
        const categoryKey = buildCategoryKey(categoryName);
        const categoryItem = await data.categories.get(categoryKey);

        if (!categoryItem || !categoryItem.category) {
            await createCategory(categoryName);
        }

        return createCategoryGame(categoryName, game);
    } catch (error) {
        console.log(error);

        subsegment.addError(error);

        logger.error({
            gameId: game.id,
            category: categoryName, ...error
        }, `Error when updating category ${categoryName}`);
    } finally {
        subsegment.close();
    }
}

async function gameUpdatedHandler(event) {
    logger.info({event}, "Game Updated Event");

    const {game} = event;
    const categories = game.categories || [];
    const updateCategoryPromises = categories.map(category => {
        return updateCategory(category, game);
    });

    return Promise.all(updateCategoryPromises)
        .then(results => {
            logger.info({results}, 'All category updates succeeded');

            return results;
        })
        .catch(error => {
            logger.error({error, gameId: game.id}, 'There was an error when trying to update categories');

            throw error;
        });
}

const handler = arc.events.subscribe(gameUpdatedHandler);

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = true;
    awsRequestId = context.awsRequestId || uuidv4();

    // no need to do this for every single call, tables won't change unless re-deploy happens.
    if (!data) {
        data = await arc.tables();
    }

    logger = initialize({
        awsRequestId,
        ...ctx,
    });

    return handlerWithXRayContext({logger, ...ctx, awsRequestId}, async () => await handler(event));
}
