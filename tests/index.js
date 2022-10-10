import Docs from '../src/index.js'

const allOn = false

const debug = {
    html: allOn,
    unchanged: allOn,
    unsupported: allOn,
    copied: allOn,
    broken: true,
    ignored: true,
    written: allOn,
    unmapped: true,
    invalid: true
}
// import config from '../docs.config.json' assert {type: 'json'}
// const docs = new Docs(config)

const docs = new Docs(undefined, debug)
await docs.generate()