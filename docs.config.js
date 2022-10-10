

const basePattern = "github.com/brainsatplay"
const config = {
    mdIn: "source",
    htmlOut: "docs",
    mdOut: "compiled",
    repository: "github.com/brainsatplay/docs",
    // publications:  {
    //     [`${basePattern}/accessify`]: "libraries/wasl",
    //     [`${basePattern}/brainsatplay`]: "libraries/brainsatplay",
    //     [`${basePattern}/components`]: "libraries/components",
    //     [`${basePattern}/datastreams-api`]: "libraries/datastreams-api",
    //     [`${basePattern}/docs`]: "libraries/docs",
    //     [`${basePattern}/freerange`]: "libraries/freerange",
    //     [`${basePattern}/graphscript`]: "libraries/graphscript",
    //     [`${basePattern}/nRF52-Biosensing-Boards`]: "libraries/nRF52",
    //     [`${basePattern}/tinybuild`]: "libraries/tinybuild",
    //     [`${basePattern}/wasl`]: "libraries/wasl",
    //     [`${basePattern}/visualscript`]: "libraries/visualscript"
    // },

    stylesheet: './static/custom.css',
    favicon: './static/img/favicon.ico',
    title: "Brains@Play Docs",
    name: "Brains@Play",

    templates: {
        "html": "templates/document.template.html",
        "wasl.json": "templates/wasl.template.html"
    },
    publications: [
        {
            pattern: basePattern,
            extension: ".md",
            map: {
                accessify: "repos/accessify",
                brainsatplay: "repos/brainsatplay",
                components: "repos/components",
                [`datastreams-api`]: "repos/datastreams-api",
                docs: "repos/docs",
                [`escompose`]: "repos/escompose",
                freerange: "repos/freerange",
                graphscript: "repos/graphscript",
                [`nRF52-Biosensing-Boards`]: "repos/nRF52",
                tinybuild: "repos/tinybuild",
                wasl: "repos/wasl",
                visualscript: "repos/visualscript"
            }
        }
    ]
}

export default config