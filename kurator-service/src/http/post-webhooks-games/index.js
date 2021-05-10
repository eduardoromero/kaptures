const {handlerWithXRayContext} = require("@architect/shared/tracing");
const {initialize} = require('@architect/shared/logger');
const {getClient} = require('@architect/shared/storyblock');
const arc = require('@architect/functions');
const jsonata = require("jsonata");

const OPERATION = "WEBHOOK_GAMES";
const TYPE = 'HTTP';
const ctx = {
    operation: OPERATION,
    type: TYPE,
}
const logger = initialize(ctx);
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

    return storyblock.getStory(id).then(data => {
        return mapping_expression.evaluate(data);
    }).catch(error => {
        logger.error({error: {...error, stack: error.stack}}, `There was an error attempting to talk to storyblock ${error.message}`)
    })
}

async function route(req, context) {
    const {body} = req;
    const {action = '', story_id} = body;

    if (action === 'published') {
        logger.info({action: action.toUpperCase(), story_id});

        try {
            const game = await getStoryblockGame(story_id);
            logger.info({game: game.id,})

            const data = await arc.tables();
            const json = await data.games.put(game);

            return {
                status: 200,
                json: {
                    game: story_id
                }
            }
        } catch (error) {
            logger.error({...error}, `There was an error attempting to save this entry ${error.message}`);

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
    context.logger = logger;

    logger.info(req, "request")
    logger.info(context, "context")

    return handlerWithXRayContext({logger, ...ctx }, async () => route(req, context));
}

exports.handler = arc.http(handler)