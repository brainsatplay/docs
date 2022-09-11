import Docs from '../index.js'

// import config from '../docs.config.json' assert {type: 'json'}
// const docs = new Docs(config)

const docs = new Docs()
await docs.generate()