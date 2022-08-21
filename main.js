const chalk = require('chalk')

const COMMAND_OPTIONS = {
    '-h, --host': 'specify server host',
    '-p, --port': 'specify server port',
    '--run [command]': 'run another command in parallel',
    '--mock': 'enables mocks',
    '--engine': 'enables Apollo Engine',
    '--delay': 'delays run by a small duration',
    '--generate-schema': 'auto-generate JSON and GraphQL schema files',
}

const SCHEMA_OPTIONS = {
    '--endpoint [endpoint]': 'URL of running server or path to JSON schema file',
    '--key [key]': 'Engine service key',
    '--tag [tag]': 'Schema Tag',
}

const DEFAULT_GENERATE_OUTPUT = './node_modules/.temp/graphql/schema'

function nullable (value) {
    return value == null ? {} : value
}

module.exports = (api, options) => {
    const apolloOptions = nullable(nullable(options.pluginOptions).apollo)
    const useThreads = process.env.NODE_ENV === 'production' && options.parallel
    const cacheDirectory = api.resolve('node_modules/.cache/cache-loader')
    const { generateCacheIdentifier } = require('./utils')

    api.chainWebpack(config => {
        const rule = config.module
            .rule('gql')
            .test(/\.(gql|graphql)$/)
            .use('cache-loader')
            .loader('cache-loader')
            .options({ cacheDirectory })
            .end()

        if (useThreads) {
            rule
                .use('thread-loader')
                .loader('thread-loader')
        }

        rule
            .use('gql-loader')
            .loader('graphql-tag/loader')
            .end()

        if (api.hasPlugin('eslint') && config.module.rules.has('eslint')) {
            if (apolloOptions.lintGQL) {
                const id = generateCacheIdentifier(api.resolve('.'))

                config.module
                    .rule('eslint')
                    .test(/\.(vue|(j|t)sx?|gql|graphql)$/)
                    .use('eslint-loader')
                    .tap(options => {
                        options.extensions.push('.gql', '.graphql')
                        return {
                            ...options,
                            cacheIdentifier: options.cacheIdentifier + id,
                        }
                    })
            } else if (apolloOptions.lintGQL !== false) {
                console.log('To enable GQL files in ESLint, set the `pluginOptions.apollo.lintGQL` project option to `true` in `vue.config.js`. Put `false` to hide this message.')
                console.log('You also need to install `eslint-plugin-graphql` and enable it in your ESLint configuration.')
            }
        }

        config.resolve
            .extensions
            .prepend('.mjs')

        config.module
            .rule('mjs')
            .test(/\.mjs$/)
            .include
            .add(/node_modules/)
            .end()
            .type('javascript/auto')

        // Add string template tag transform to Bublé
        config.module
            .rule('vue')
            .use('vue-loader')
            .loader('vue-loader')
            .tap(options => {
                options.transpileOptions = options.transpileOptions || {}
                options.transpileOptions.transforms = options.transpileOptions.transforms || {}
                options.transpileOptions.transforms.dangerousTaggedTemplateString = true
                return options
            })
    })

    async function autoGenerateSchema (endpoint) {
        // Auto-generate if json file doesn't exist
        if (endpoint.match(/\.json$/i)) {
            const fs = require('fs')
            const file = api.resolve(endpoint)
            if (!fs.existsSync(file)) {
                const path = require('path')
                const output = path.join(path.dirname(file), path.basename(file, path.extname(file)))
                const execa = require('execa')
                await execa('vue-cli-service apollo:schema:generate', [
                    '--output',
                    output,
                ], {
                    stdio: ['inherit', 'inherit', 'inherit'],
                    cleanup: true,
                    shell: true,
                })
                const { info } = require('@vue/cli-shared-utils')
                info(`The JSON schema was automatically generated in '${file}'.`, 'apollo')
            }
        }
    }
}

module.exports.defaultModes = {
    'apollo:dev': 'development',
}
