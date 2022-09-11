import Docs from '../index.js'

const debug = {
    html: false,
    unchanged: false,
    unsupported: false,
    copied: false,
    broken: true,
    ignored: true
}
// import config from '../docs.config.json' assert {type: 'json'}
// const docs = new Docs(config)

const docs = new Docs(undefined, debug)
await docs.generate()