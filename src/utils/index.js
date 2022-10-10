import path from 'path'
export * as filesystem from './filesystem.js'

export const pathSep = '/'
export const readme = 'README.md'
export const lineLinkRegex = /(?:.*)\](?:\(|:\s)([^)\n\s]+)\)?(?:[^\n]*)/g
export const linkRegex = /\](?:\(|:\s)([^)\n\s]+)\)?/g
export const markdown = '.md'
export const htmlCommentRegex = /\<\!\-\-\s([^\s].*)\s\-\-\>/g

export const getBases = (config) => {
    const main = process.cwd()
    const input = path.join(main, config.input)
    return {
        main,
        input
    }
}

export const extension = (filePath) => {
    const split = path.basename(filePath).split('/').slice(-1)[0].split('.')
    if (split.length > 1) return split.slice(-1)[0]
    else return ''
}

export const markdownExtension = '.md'
export const correctExtension = (filePath, base) => {
    const name = path.basename(filePath)
    const ext = name.slice(-base.length)
    return ext === base
}

export const isRemote = (str) => (str.slice(0, 7) == 'http://' || str.slice(0, 8) == 'https://')
export const isRelative = (str) => str[0] === '.'
export const isMarkdown = (str) => (str.slice(-markdown.length) === markdown)


export const mergeSafe = (base, update) => {
    const baseNoFile = path.dirname(base)
    try {
        return new URL(update, baseNoFile + '/').href
    } catch (e) {
        return path.join(baseNoFile, update)
    }
}

export const map = (thisPath, absoluteMapPath, name) => {

    const transferredSplit = absoluteMapPath.split(pathSep)
    const thisSplit = thisPath.split(pathSep)

    if (!name) name = thisSplit.pop() // derive name

    let relative = []
    const filtered = transferredSplit.filter((v, i) => {
        if (thisSplit[i] !== v) {
            relative.push('..')
            return true
        } else return false
    })

    const res = path.join(path.join(...relative, ...filtered), name)

    return res
}

export const prettyPath = (path, relative = 'input', config) => {
    if (relative == 'input') relative = 'mdIn' // actual input, not copy
    return `${config[relative]}/${path.split(`${config.input}/`)[1]}` // transform filePath to be readable and accessible by link
}

// Use Two Paths to Get a Relative Path Between Them
export const pathTo = (to, from, name) => {

    const ogFrom = from
    const ext = path.extname(from)
    if (ext) from = path.dirname(from) // only provide dirname

    const fromSplit = from.split(pathSep)
    const toSplit = to.split(pathSep)

    if (!name) name = toSplit.pop() // derive name

    const index = fromSplit.findIndex((v, i) => (toSplit[i] !== v) ? true : false)

    let mapped = name
    if (index > 0) {
        const nBack = fromSplit.length - index
        mapped = path.join(path.join(...Array.from({ length: nBack }, () => '..'), ...toSplit.slice(index)), name) // go out
    } else mapped = path.join(...toSplit.slice(fromSplit.length), name) // go up


    // console.log('Path To', to, ogFrom, mapped)
    // console.log('Path To (res)', mapped)

    if (mapped[0] !== '.') return `./${mapped}`

    else return mapped
}
