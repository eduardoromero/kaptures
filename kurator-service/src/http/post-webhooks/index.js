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
let data, logger;
const storyblock = getClient();

async function getStoryblockContent(id) {
    const subsegment = AWSXRay.getSegment().addNewSubsegment('##StoryBlock.GetStory');
    subsegment.addMetadata('storyId', id);

    logger.info({storyId: id}, `Fetching data for storyId: ${id}`);

    return storyblock.getStory(id).then(response => {
        subsegment.addMetadata('storyblock-content', response);
        return response.data;
    }).catch(error => {
        subsegment.addError(error);

        logger.error({
            error: {...error, stackTrace: error.stack},
            storyId: id
        }, `There was an error attempting to talk to storyblock ${error.message}`)
    }).finally(() => {
        subsegment.close();
    })
}

function storyToGame(data) {
    const mapping_expression = jsonata(`{
        "id": $.story.slug,
        "name": $.story.name,
        "website": $.story.content.website.url,
        "categories": $.story.content.categories,
        "developer": $.story.content.developer,
        "publisher": $.story.content.publisher,
        "platforms": $.story.content.platforms,
        "_type": $.story.content.component,
        "created": $.story.created_at,
        "modified": $.story.published_at
    }`);

    return mapping_expression.evaluate(data);
}

function storyToKapture(data) {
    const mapping_expression = jsonata(`{
        "id": $.story.content.id,
        "kapture": $.story.content.kapture,
        "game": $replace($.story.content.game.cached_url, "games/", ""),
        "owner": $.story.content.owner,
        "title": $.story.content.title,
        "comment": $.story.content.comment,
        "likes": $number($.story.content.likes),
        "views": $number($.story.content.views),
        "_type": $.story.content.component,    
        "created": $.story.created_at,
        "modified": $.story.published_at
    }`);

    return mapping_expression.evaluate(data);
}

async function updateGame(game) {
    const subsegment = AWSXRay.getSegment().addNewSubsegment('##DDB.UpdateGame');
    subsegment.addAnnotation('gameId', game.id);

    try {
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


async function updateKapture(kapture) {
    const subsegment = AWSXRay.getSegment().addNewSubsegment('##DDB.UpdateKapture');
    subsegment.addAnnotation('kaptureId', kapture.id);
    subsegment.addAnnotation('gameId', kapture.game);

    try {
        const json = await data.kaptures.put(kapture);

        logger.info({gameId: kapture.game, kaptureId: kapture.id}, `Updated kapture ${kapture.id}`);
        subsegment.addMetadata('kapture', json);

        return json;
    } catch (error) {
        subsegment.addError(error);
        logger.error({gameId: kapture.game, kaptureId: kapture.id, ...error}, `Error when storing kapture ${game.id}`);
    } finally {
        subsegment.close();
    }
}

async function triggerUpdateGameEvent(game) {
    // send update
    await arc.events.publish({
        name: 'game-updates',
        payload: {
            game,
            event: 'game-updated',
            timestamp: new Date()
        },
    })
}

async function route(req, context) {
    const {body} = req;
    const {action = '', story_id} = body || {};
    const subsegment = AWSXRay.getSegment();

    if (action === 'published') {
        logger.info({action: action.toUpperCase(), storyBookId: story_id}, "New content was published");

        try {
            const content = await getStoryblockContent(story_id);
            const type = content?.story?.content?.component || "unknown";
            logger.info({storyId: story_id, type, content}, `Content from Storyblok for ${story_id}`);

            switch (type) {
                case "games":
                    const game = storyToGame(content);
                    await updateGame(game);
                    await triggerUpdateGameEvent(game);
                    break;
                case "kaptures":
                    const kapture = storyToKapture(content);
                    console.log({kapture});
                    await updateKapture(kapture);
                    break;
                default:
                    logger.error({type}, "Unhandled content type")
            }

            return {
                status: 200,
                json: {
                    content: story_id,
                    type
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
                    stackTrace: error.stack
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

    if (!data) {
        data = await arc.tables();
    }

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