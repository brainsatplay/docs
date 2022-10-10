import Link from "./Link.js";
import { linkRegex } from './utils/index.js'

const og = `**Source:** [Github](https://github.com/brainsatplay/brainsatplay)`

export default class Line {


    links = []
    options = {}

    #value;
    get value() {
        return this.#value
    }

    // Language-Specific Versions
    markdown = null
    html = null

    set value(line){

        this.#value = this.html = this.markdown = line

        // Get All Links
        let linkMatch;
        while ((linkMatch = linkRegex.exec(line)) != null) {
            const link = new Link(linkMatch[1], this, this.options)
            this.links.push(link)
            line = line.replace(linkMatch[1], Array.from({length: link.length}, () => ' ').join('')) // Remove link but keep length
        }
    }

    constructor(line, options) {
        this.options = options
        this.value = line
    }
}