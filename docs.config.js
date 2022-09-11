

const basePattern = "github.com/brainsatplay"
const config = {
    mdIn: "source",
    htmlOut: "docs",
    mdOut: "compiled",
    // publications:  {
    //     [`${basePattern}/accessify`]: "libraries/wasl",
    //     [`${basePattern}/brainsatplay`]: "libraries/brainsatplay",
    //     [`${basePattern}/components`]: "libraries/components",
    //     [`${basePattern}/datastreams-api`]: "libraries/datastreams-api",
    //     [`${basePattern}/docs`]: "libraries/docs",
    //     [`${basePattern}/es-plugins`]: "libraries/es-plugins",
    //     [`${basePattern}/freerange`]: "libraries/freerange",
    //     [`${basePattern}/graphscript`]: "libraries/graphscript",
    //     [`${basePattern}/nRF52-Biosensing-Boards`]: "libraries/nRF52",
    //     [`${basePattern}/studio`]: "libraries/studio",
    //     [`${basePattern}/tinybuild`]: "libraries/tinybuild",
    //     [`${basePattern}/wasl`]: "libraries/wasl",
    //     [`${basePattern}/visualscript`]: "libraries/visualscript"
    // },
    stylesheet: './static/custom.css',
    favicon: './static/img/favicon.ico',
    title: "Brains@Play Docs",

    templates: {
        "html": "templates/document.template.html",
        "wasl.json": "templates/wasl.template.html"
    },
    publications: [
        {
            pattern: basePattern,
            extension: ".md",
            update: true,
            map: {
                accessify: "libraries/wasl",
                brainsatplay: "libraries/brainsatplay",
                components: "libraries/components",
                [`datastreams-api`]: "libraries/datastreams-api",
                docs: "libraries/docs",
                [`es-plugins`]: "libraries/es-plugins",
                freerange: "libraries/freerange",
                graphscript: "libraries/graphscript",
                [`nRF52-Biosensing-Boards`]: "libraries/nRF52",
                studio: "libraries/studio",
                tinybuild: "libraries/tinybuild",
                wasl: "libraries/wasl",
                visualscript: "libraries/visualscript"
            }
        }
    ]
}

export default config