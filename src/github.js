import https from 'https'
import path from 'path'
import * as utils from './utils/index.js'
const search = 'github.com'

const focus = 'https://github.com/brainsatplay/graphscript/blob/master/docs/Graph.md'
export async function transform(info) {
    const link = info.raw
    let linkPath = info.linkPath ?? link

    let raw, resolved;
    const original = raw = resolved = link

    const split = link.split(`${search}/`)
    const end = split[1].split(utils.pathSep)

    if (end) {

        const [organization, repo, blob, branch, ...details] = end

        if (organization && repo) {

            const branchesToTry = (branch) ? [branch] : ['main', 'master']

            const tryPath = async (path) => {
                const promise = new Promise((resolve, reject) => {
                    https.get(path, (res) => {
                        if (res.statusCode === 200) resolve(true)
                        else reject(false)
                        res.destroy()
                    })
                })

                return await promise
            }

            raw = null
            let rightBranch = null

            // Find Active Branch
            for (let i = 0; i < branchesToTry.length; i++) {
                rightBranch = branchesToTry[i]
                if (!raw) {
                    const last = details.slice(-1)[0]
                    if (!last || !last.includes('.md')) details.push(utils.readme) // Default to README.md
                    raw = `https://raw.githubusercontent.com/${[organization, repo, rightBranch, ...details].join(utils.pathSep)}`
                    await tryPath(raw).catch((e) => raw = null)
                }
            }

            if (raw === null) return // No resolved file...

            resolved = [
                (split[0].slice(-1) === utils.pathSep) ? split[0].slice(0, -1) : split[0],
                search, organization, repo, 'blob', rightBranch, ...details // remove branch
            ].join(utils.pathSep)


            if (path.extname(linkPath) != '') linkPath  = path.dirname(linkPath) // remove file
            linkPath = path.join(linkPath, ...details)
        }
    }

    const output = {
        raw,
        resolved,
        original,
        linkPath
    }

    return output

}



export async function check(info) {
    return info.raw.includes(search)
}