import fs from 'fs'
import Line from './Line.js'
import * as utils from './utils/index.js'
import * as create from './create.js'
import * as showdown from './showdown.js'

import path from 'path'

import * as preprocess from './preprocess/index.js'

const pathSep = utils.pathSep
const htmlCommentRegex = utils.htmlCommentRegex
const lineLinkRegex = utils.lineLinkRegex

export default class Document {

    path = undefined
    buffer = undefined
    text = undefined
    relativeTo = undefined
    publication = undefined
    origin = undefined

    log = {
        written: {}
    }

    lines = {} // Global line registry

    context = null
    type = 'standard'

    constructor(path, info, options) {
        this.path = path

        this.context = options.context
        this.origin = options.origin ?? path
        this.relativeTo = options.origin

        delete options.context

        // -------------- Set Info --------------
        // Buffer
        if (info.constructor.name === 'Buffer') {
            this.buffer = info
            this.text = info.toString()
            this.type = 'filesystem'
        }
        
        // Text
        else this.text = info

    }


    relink = async () => {

        // console.log('---------------------', this.path, '---------------------')

        const publications = this.context.config.publications
        for (let i in publications) {
            const publication = publications[i]
            if (publication) {
                if (typeof publication != 'object') publication = { map: publication }

                this.publication = publication
                let isString = typeof this.publication.map === 'string'

                // Multiple Rounds of Matching (in case of more than one link on a line)
                let links = []
                let lineMatch = null

                const userRegex = new RegExp(`(.*)${publication.pattern ?? ''}(.*)`, 'g')

                let options = {
                    userRegex,
                    isString,
                    publication,
                    document: this,
                    context: this.context
                }


                // Get All Links
                // let copy = this.text
                const getLinks = (copy) => {

                    let count = 0
                    while ((lineMatch = lineLinkRegex.exec(copy)) != null) {
                        const lineText = lineMatch[0]
                        const line = this.lines[lineText] ?? new Line(lineText, options)
                        this.lines[lineText] = line
                        links.push(...line.links)
                        copy = copy.replace(lineText, '') // Remove Line
                        count++
                    }

                    return {
                        copy, count
                    }
                }

                // Get All Links (as some are missed each round...)
                let copy = this.text
                let newLinks = 0
                do {
                     const output = getLinks(copy)
                    copy = output.copy
                    newLinks = output.count
                } while (newLinks > 0)

                // Transfer Link Files to Local Filesystem
                await Promise.all(links.map(link => link.transfer())) // Relink All Links

                // Submit Changes to Links
                await Promise.all(links.map(link => link.submit())) // Relink All Links
            }
        }

        return true
    }


    save = (changes) => {

        const config = this.context.config
        const filePath = this.path
        const { input, main } = utils.getBases(config)
        const { output, templates } = config

        let ext = path.extname(this.path)
        if (this.path.includes('.wasl.json')) ext = '.wasl' // recognize .wasl.json files


        // ----------------------- Get Sidebar -----------------------
        const find = `${process.cwd()}/${config.input}/`
        const docNames = Object.keys(this.context.documents).map(key => {
            return {
                name: key.replace(find, ''),
                link: utils.pathTo(key, this.path)
            }
        })

        const createListItem = (name, link) => {
            return `<a href="${link.replace('.md', '.html')}"><li>${name.replace('.md', '')}</li></a>`
        }

        const toUpperCase = name => name[0].toUpperCase() + name.slice(1)
        const getName = (name) => {
            name = name.split(/(?=[A-Z][a-z])/).join(' ') // Split on Capital Letters (but not acronyms)
            name = name.split('-').map(toUpperCase).join(' ')
            name = toUpperCase(name) // Capitalize Each Word
            return name
        }

        const hierarchy = {}
        docNames.forEach(o => {
            const path = o.name.split('/')
            let name = path.pop()
            if (name === 'index.md') name = 'Main Page'
            if (path.length === 0) name = 'Home'

            name = getName(name) 

            let target = hierarchy
            path.forEach(str => {
                if (!target[str]) target[str] = {} //createListItem(str, accum.join('/'))
                target = target[str]
            })

            target[name] = o
        })

        const getList = (target, name, top=true) => {

            const items = []
            for (let name in target) {
                if (name === 'drafts') continue // Removing drafts from the sidebar
                const info = target[name]
                if (typeof info === 'object' && info.link) {
                    items.push(createListItem(name, info.link))
                } else {
                    const list = getList(info, name, false)
                    items.push(list)
                }
            }

            const ul = `<ul>${items.join('')}</ul>`
            const output = (top) ? ul : (name) ? `<li>${getName(name) }</li>${ul}` : ul
            return output
        }

        const sidebar = `<div id="brainsatplay-docs-sidebar">${getList(hierarchy)}</div>`


        for (let ext in templates) {
            if (typeof templates[ext] === 'string') {
                templates[ext] = {
                    text: fs.readFileSync(templates[ext]).toString(),
                    map: {}
                }

                const matches = [...templates[ext].text.matchAll(htmlCommentRegex)]
                matches.forEach(arr => {
                    const comment = arr[0]
                    const key = arr[1]
                    templates[ext].map[key] = comment
                })
            }
        }

        // console.log('templates', templates)

        const notCommon = this.path.replace(input, '')
        const isBoolean = typeof this.context.debug === 'boolean'
        const debugHTML = isBoolean ? this.context.debug : this.context.debug?.html

        const changeLog = (path) => (debugHTML) ? console.log(`--------------- ${path.replace(`${main}/`, '')} ${changes._write ? '(saved)' : ''} ---------------`) : null
        const changeLogSubheader = (message) => (debugHTML) ? console.log(`--- ${message} ---`) : null
        const changeLogListItem = (message) => (debugHTML) ? console.log(`- ${message}`) : null

        // Deal with Different File Types

        let pathToUse = ''
        let returnVal = false

        const nBack = notCommon.split(pathSep).length - 2
        const rel = Array.from({ length: nBack }, _ => '..').join('/')

        const stylesheetLocation = './.docs/default.css'
        const destination = path.join(process.cwd(), config.output, stylesheetLocation)
        utils.filesystem.check(destination)
        fs.copyFileSync('templates/default.css', destination)

        const commentReplacements = {
            content: '',
            defaultstylesheet: create.stylesheet.generator(path.join(rel, stylesheetLocation))
        }

        if (config.sidebar) commentReplacements.sidebar = sidebar

        for (let key in create) {
            if (config[key] && create[key]) {
                commentReplacements[key] = create[key].generator(create[key].format === 'link' ? path.join(rel, config[key]) : config[key])
            }
        }



        if (!this.buffer) console.error('No buffer for', this.path)
        switch (ext) {
            case '.md':

                let text = this.buffer.toString()

                if (changes) {

                    let mdText = text // Original markdown text
                    changeLog(filePath)
                    for (let type in changes) {
                        changeLogSubheader(`${type[0].toUpperCase() + type.slice(1)} Links`)

                        for (let link in changes[type]) {
                            const { lines, markdown } = changes[type][link]
                            let html = changes[type][link].html
                            changeLogListItem(`${link} —> ${html}`)

                            lines.forEach(line => {

                                // No Line in text anymore
                                if (!text.includes(line.html)) {
                                    console.log('OH NO! No Line in text anymore...', line.id, line.value, line.html, text)
                                    throw new Error('e')
                                    // > Although specified in the WASL standard, these are *not* handled by the [wasl](https://github.com/brainsatplay/wasl/blob/main/README.md) library itself. Instead, **graphs** are assembled by external libraries such as [graphscript](https://github.com/brainsatplay/graphscript/blob/master/README.md).
                                }

                                // console.log('changes', changes)
                                const newHTML = line.html.replace(link, html)
                                const newMarkdown = line.markdown.replace(link, markdown) // Update markdown in placeholder line
                                text = text.replace(line.html, newHTML) // update for HTML
                                mdText = mdText.replace(line.markdown, newMarkdown) // update for MD
                                line.markdown = newMarkdown
                                line.html = newHTML

                            })
                        }
                    }

                    if (changes._write) {
                        this.log.written[filePath] = true
                        fs.writeFileSync(filePath, mdText);
                    }

                    if (debugHTML) console.log('\n')
                }

                pathToUse = path.join(main, output, notCommon.replace('.md', '.html'))
                ext = '.html'
                returnVal = true

                text = preprocess.code.default(text)

                commentReplacements.content = showdown.converter.makeHtml(text); // html content
                break;

            case '.wasl':
                return false

            default:
                pathToUse = path.join(main, output, notCommon)
                commentReplacements.content = this.buffer.toString()
                returnVal = undefined
                break;
        }

        if (pathToUse) {

            let content = commentReplacements.content
            const template = templates[ext.slice(1)]
            if (template) {
                content = template.text // replace with template
                for (let key in template.map) {
                    const rep = commentReplacements[key]
                    if (rep) content = content.replace(template.map[key], rep)
                }
            } else content = this.buffer // replace with buffer for non-template files


            utils.filesystem.check(pathToUse)
            fs.writeFileSync(pathToUse, content);
        }

        return returnVal
    }
}