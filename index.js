import Docs from './src/index.js'
import config from './docs.config.json' assert {type: 'json'}
const docs = new Docs(config)
docs.generate()