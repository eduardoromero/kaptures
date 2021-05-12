const {handlerWithXRayContext, AWSXRay} = require("@architect/shared/tracing");
const {initialize} = require('@architect/shared/logger');
const arc = require('@architect/functions');
const { v4: uuidv4 } = require('uuid');
const jsonata = require("jsonata");

const OPERATION = "GET_GAMES";
const TYPE = 'HTTP';
const ctx = {
    operation: OPERATION,
    type: TYPE,
}

let logger;

function mapper(data) {
    const mapping_expression = jsonata(`{
        'games': $.Items,
        'meta': {
            'total': $.Count
        }
    }`);

    return mapping_expression.evaluate(data);
}

async function getDDBGames() {
    const subsegment = AWSXRay.getSegment().addNewSubsegment('##DDB.GetGames');
    logger.info("fetching games");

    try {
        const data = await arc.tables();
        return await data.games.scan({});
    } catch(error) {
        subsegment.addError(error);
        logger.error({ ...error}, `Error attempting to get games`);
    } finally {
        subsegment.close();
    }
}

async function getGames(req) {
    logger.info(req);
    try {
        const json = await getDDBGames();

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
    context.callbackWaitsForEmptyEventLoop = true;
    const awsRequestId = context.awsRequestId || uuidv4();
    logger = initialize({
        awsRequestId,
        ...ctx,
    });

    context.logger = logger;

    logger.info(req, "request")
    logger.info(context, "context")

    return handlerWithXRayContext({logger, ...ctx, awsRequestId}, async () => getGames(req))
}

exports.handler = arc.http.async(handler)