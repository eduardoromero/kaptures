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

async function getDDBGame(game) {
    const subsegment = AWSXRay.getSegment().addNewSubsegment('##DDB.GetGame');
    logger.info({gameId: game}, `feching Game ${game}`);

    try {
        return await data.games.get({id: game});
    } catch (error) {
        logger.error({gameId: game, ...error, stackTrace: error.stack}, `Error attempting to get game ${game}`);
        subsegment.addError(error);
    } finally {
        subsegment.close();
    }
}

function mapper(data) {
    const mapping_expression = jsonata(`{
        "game": $,
        "meta": {
            "created": $.created,
            "modified": $.modified
        }
    }`);

    return mapping_expression.evaluate(data);
}

async function getGame(request) {
    const {game: gameId} = request.params || {};

    if (!gameId) {
        logger.error({gameId}, "Bad Request");

        return {
            status: 400,
            message: "Bad Request",
        }
    }

    try {
        const data = await getDDBGame(gameId);

        if (!data || !data.id) {
            logger.error({gameId}, "Game Not Found");

            return {
                status: 404,
                message: "Not found",
            }
        }


        const json = {
            ...mapper(data),
        }

        logger.debug({game: json, gameId}, `Successfully returned ${gameId}`);

        return {
            status: 200,
            json
        };
    } catch (error) {
        logger.error({
            gameId,
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

    return handlerWithXRayContext({logger, ...ctx, awsRequestId}, async () => getGame(req))
}

exports.handler = arc.http.async(handler)