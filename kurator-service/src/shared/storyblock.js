const StoryblokClient = require('storyblok-js-client');
const { logger } = require('./logger');

const {STORYBLOCK_API_TOKEN} = process.env;

const DEFAULT_CONFIG = {
    accessToken: STORYBLOCK_API_TOKEN,
    cache: {
        clear: "auto",
        type: "memory"
    }
};

let client;

function initialize(config = {}) {
    const conf = {
        ...DEFAULT_CONFIG,
        ...config,
    }

    logger.info({config: conf}, "Starting StoryBlock Client");

    client = new StoryblokClient(conf);
    return client;
}

module.exports = {
    update: (config = {}) => {
        return initialize(config);
    },
    getClient: (config = {}) => {
        if (!client || config.initialize !== undefined) {
            return initialize(config);
        }

        return client;
    },
}