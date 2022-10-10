export const name = {
    generator: (text) => `<h1>${text}</h1>`,
    // generator: (text) => `<a href="/"><h1>${text}</h1></a>`,
    format: 'text'
}

export const title = {
    generator: (text) => `<title>${text}</title>`,
    format: 'text'
}

export const stylesheet = {
    generator: (link) => `<link rel=stylesheet href="${link}"/>`,
    format: 'link'
}

export const content = {
    generator: (text) => text,
    format: 'text'
}

export const favicon = {
    generator: (link) => `<link rel="icon" href="${link}" type="image/x-icon" />`,
    format: 'link'
}