const SUPPORTED_TYPES = {
    ServerlessFunction: 'AWS::Serverless::Function'
}

function resourceSupportsActiveTracing(type) {
    return type === SUPPORTED_TYPES.ServerlessFunction;
}

function addActiveTracing(type, options) {
    switch (type) {
        case SUPPORTED_TYPES.ServerlessFunction:
            // enable active tracing
            options['Properties']['Tracing'] = 'Active';
            options['Properties']['Environment']['Variables']['XRAY_ENABLED'] = true;
            // add XRay Policy to write segments
            options['Properties']['Policies'] = [
                ...(options['Properties']['Policies'] || []),
                "AWSXrayWriteOnlyAccess"
            ]
            break;
    }

    return options;
}

function updateRoleForActiveTracing(cfn) {
    const existing = cfn['Resources']['Role']['Properties']['Policies'] || [];

    cfn['Resources']['Role']['Properties']['Policies'] = [
        ...existing,
        {
            PolicyName: 'XRayActiveTracing',
            PolicyDocument: {
                Statement: [
                    {
                        Effect: 'Allow',
                        Action: [
                            "xray:PutTraceSegments",
                            "xray:PutTelemetryRecords",
                            "xray:GetSamplingRules",
                            "xray:GetSamplingTargets",
                            "xray:GetSamplingStatisticSummaries",
                        ],
                        Resource: ['*']
                    },
                ]
            }
        }
    ];
}

/**
 * @param {object} arc - the parsed app.arc file currently executing
 * @param {object} cloudformation - the current AWS::Serverless CloudFormation template
 * @param {object} stage - the application stage (one of `staging` or `production`)
 * @returns {object|Promise} must return a CloudFormation object or a promise for a CloudFormation object
 **/
module.exports = function enableActiveTracing(arc, cfn, stage) {
    const tracing = arc['active-tracing']
    const {Resources: resources} = cfn;
    let enabled = false;

    if (tracing) {
        // walks thru resources
        for (const [resource, props] of Object.entries(resources)) {
            const {Type: type} = props;

            if (resourceSupportsActiveTracing(type)) {
                enabled = true;
                cfn['Resources'][resource] = addActiveTracing(type, props);
            }
        }
    }

    if (enabled) {
        updateRoleForActiveTracing(cfn);
    }

    return cfn
}