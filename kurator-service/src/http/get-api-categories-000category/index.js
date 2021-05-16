const {handlerWithXRayContext, AWSXRay} = require("@architect/shared/tracing");
const {initialize} = require('@architect/shared/logger');
const arc = require('@architect/functions');
const {v4: uuidv4} = require('uuid');
const jsonata = require("jsonata");

const OPERATION = "GET_CATEGORY";
const TYPE = 'HTTP';
const ctx = {
    operation: OPERATION,
    type: TYPE,
}

let logger, data;

async function getDDBCategoryCollection(category) {
    const subsegment = AWSXRay.getSegment().addNewSubsegment('##DDB.GetCategory');
    logger.info({categoryId: category}, `feching Category ${category}`);

    try {
        const query = {
            KeyConditionExpression: '#PK = :PK and begins_with(categoryGameTs, :SK)',
            ExpressionAttributeNames: {
                "#PK": "PK"
            },
            ExpressionAttributeValues: {
                ":PK": 'category',
                ":SK": `${category}#`,
            }
        }

        logger.debug({categoryId: category, query}, `Category Query`);
        return await data.categories.query(query);
    } catch (error) {
        logger.error({
            categoryId: category,
            ...error,
            stackTrace: error.stack
        }, `Error attempting to get category ${category}`);
        subsegment.addError(error);
    } finally {
        subsegment.close();
    }
}

function mapper(data) {
    const mapping_expression = jsonata(`{
        'games': $map($.Items, function($i) {
            {
                "game": $i.game,
                "title": $i.title,
                "platforms": $i.platforms,
                "updated": $i.updated,
                "_type": "games"
            }
        }),'meta': {
            'gameCount': $.Count 
        }
    }`);

    return mapping_expression.evaluate(data);
}

async function getCategory(request) {
    const {category: categoryId} = request.params || {};

    if (!categoryId) {
        logger.error({categoryId}, "Bad Request");

        return {
            status: 400,
            message: "Bad Request",
        }
    }

    try {
        const data = await getDDBCategoryCollection(categoryId);

        if (!data || !data.Count) {
            logger.error({categoryId}, "Category Not Found");

            return {
                status: 404,
                message: "Not found",
            }
        }

        const json = {
            category: categoryId,
            _type: "category",
            ...mapper(data),
        }

        logger.debug({categoryId: categoryId, category: json}, `Successfully returned ${categoryId}`);

        return {
            status: 200,
            json
        };
    } catch (error) {
        logger.error({
            ...error,
            stackTrace: error.stackTrace,
        }, "Unexpected Error");

        return {
            status: 502,
            json: {
                name: error.name,
                message: error.message,
                stackTrace: error.stack
            }
        }
    }
}


async function handler(req, context) {
    context.callbackWaitsForEmptyEventLoop = true;
    const awsRequestId = context.awsRequestId || uuidv4();
    logger = initialize({
        awsRequestId,
        ...ctx,
    });

    if (!data) {
        data = await arc.tables();
    }

    context.logger = logger;

    logger.info(req, "request")
    logger.info(context, "context")

    return handlerWithXRayContext({logger, ...ctx, awsRequestId}, async () => getCategory(req))
}

exports.handler = arc.http.async(handler)