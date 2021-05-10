const {handlerWithXRayContext} = require("@architect/shared/tracing");
const {initialize} = require('@architect/shared/logger');
const arc = require('@architect/functions');
const jsonata = require("jsonata");

const OPERATION = "GET_GAMES";
const TYPE = 'HTTP';
const ctx = {
    operation: OPERATION,
    type: TYPE,
}

const logger = initialize(ctx);

function mapper(data) {
    const mapping_expression = jsonata(`{
        'games': $.Items,
        'meta': {
            'total': $.Count
        }
    }`);

    return mapping_expression.evaluate(data);
}

async function getGames(req) {
    logger.info(req);
    try {
        const data = await arc.tables();
        const json = await data.games.scan({});

        const total = json.Count || 0
        logger.info({ games: total }, `games found: ${total}`);

        return mapper(json);
    } catch (e) {
        logger.error(e, "There was an error");

        return {
            status: 502,
            json: {
                name: e.name,
                message: e.message,
                stack: e.stack
            }
        }
    }
}

async function handler(req, context) {
    context.logger = logger;

    logger.info(req, "request")
    logger.info(context, "context")

    return handlerWithXRayContext(ctx, async () => getGames(req))
}

exports.handler = arc.http.async(handler)