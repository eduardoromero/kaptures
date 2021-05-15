const {handlerWithXRayContext, AWSXRay} = require("@architect/shared/tracing");
const {initialize} = require('@architect/shared/logger');
const {getClient} = require('@architect/shared/storyblock');
const arc = require('@architect/functions');
const {v4: uuidv4} = require('uuid');
const jsonata = require("jsonata");

const OPERATION = "WEBHOOK_GAMES";
const TYPE = 'HTTP';
const ctx = {
    operation: OPERATION,
    type: TYPE,
}
let logger;
const storyblock = getClient();

async function getStoryblockGame(id) {

    const mapping_expression = jsonata(`{
    "id": $.data.story.slug,
    "name": $.data.story.name,
    "website": $.data.story.content.website.url,
    "categories": $.data.story.content.categories,
    "developer": $.data.story.content.developer,
    "publisher": $.data.story.content.publisher,
    "platforms": $.data.story.content.platforms,
    "_type": $.data.story.content.component,
    "created": $.data.story.created_at,
    "modified": $.data.story.published_at
    }`);

    const subsegment = AWSXRay.getSegment().addNewSubsegment('##StoryBlock.GetStory');
    subsegment.addMetadata('storyId', id);

    logger.info({storyId: id}, `Fetching data for storyId: ${id}`);

    return storyblock.getStory(id).then(data => {
        subsegment.addMetadata('storyblock-content', data);

        return mapping_expression.evaluate(data);
    }).catch(error => {
        subsegment.addError(error);

        logger.error({
            error: {...error, stack: error.stack},
            storyId: id
        }, `There was an error attempting to talk to storyblock ${error.message}`)
    }).finally(() => {
        subsegment.close();
    })
}

async function updateGame(game) {
    const subsegment = AWSXRay.getSegment().addNewSubsegment('##DDB.UpdateGame');
    subsegment.addAnnotation('gameId', game.id);

    try {
        const data = await arc.tables();
        const json = await data.games.put(game);

        logger.info({gameId: game.id, game}, `Updated game ${game.id}`);
        subsegment.addMetadata('game', json);

        return json;
    } catch (error) {
        subsegment.addError(error);
        logger.error({gameId: game.id, ...error}, `Error when storing game ${game.id}`);
    } finally {
        subsegment.close();
    }
}

async function route(req, context) {
    const {body} = req;
    const {action = '', story_id} = body || {};
    const subsegment = AWSXRay.getSegment();

    if (action === 'published') {
        logger.info({action: action.toUpperCase(), storyBookId: story_id}, "New content was published");

        try {
            const game = await getStoryblockGame(story_id);
            await updateGame(game);

            return {
                status: 200,
                json: {
                    game: story_id
                }
            }
        } catch (error) {
            subsegment.addError(error);

            logger.error({storyBookId: story_id, ...error}, `There was an error attempting to update this entry ${error.message}`);

            return {
                status: 502,
                json: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                }
            }
        }
    } else {
        return {
            status: 200,
            json: {}
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

    logger.info(req, "request");
    logger.info(context, "context");

    return handlerWithXRayContext({logger, ...ctx, awsRequestId}, async () => route(req, context));
}

exports.handler = arc.http(handler)