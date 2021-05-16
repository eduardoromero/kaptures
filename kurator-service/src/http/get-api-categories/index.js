const {handlerWithXRayContext, AWSXRay} = require("@architect/shared/tracing");
const {initialize} = require('@architect/shared/logger');
const arc = require('@architect/functions');
const { v4: uuidv4 } = require('uuid');
const jsonata = require("jsonata");

const OPERATION = "GET_CATEGORIES";
const TYPE = 'HTTP';
const ctx = {
    operation: OPERATION,
    type: TYPE,
}

let logger;

function mapper(data) {
    const mapping_expression = jsonata(`{
        'categories': $map($.Items, function($c){
            {
                "category": $c.category,
                "created": $c.created,
                "_type": $c._type
            }
        }),
        'meta': {
            'total': $.Count
        }
    }`);

    return mapping_expression.evaluate(data);
}

async function getDDBCategories() {
    const subsegment = AWSXRay.getSegment().addNewSubsegment('##DDB.GetCategories');
    logger.info("fetching categories");

    try {
        const data = await arc.tables();
        return await data.categories.query({
            KeyConditionExpression: '#PK = :PK and begins_with(categoryGameTs, :SK)',
            ExpressionAttributeNames:{
                "#PK": "PK"
            },
            ExpressionAttributeValues: {
                ":PK": 'category',
                ":SK": "##CATEGORY",
            }
        });
    } catch(error) {
        subsegment.addError(error);
        logger.error({ ...error}, `Error attempting to get categories`);
    } finally {
        subsegment.close();
    }
}

async function getCategories(req) {
    logger.info(req);
    try {
        const json = await getDDBCategories() || {Count: 0};

        const total = json.Count;
        logger.info({ categories: total }, `categories found: ${total}`);

        return mapper(json);
    } catch (e) {
        logger.error({
            ...error,
            stackTrace: error.stackTrace,
        }, "Unexpected Error");

        return {
            status: 502,
            json: {
                name: e.name,
                message: e.message,
                stackTrace: e.stack
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

    return handlerWithXRayContext({logger, ...ctx, awsRequestId}, async () => getCategories(req))
}

exports.handler = arc.http.async(handler)