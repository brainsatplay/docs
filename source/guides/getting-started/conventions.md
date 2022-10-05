# Conventions
## Plugins
As defined by [es-plugins](https://github.com/brainsatplay/es-plugins), a **plugin** is an ESM file that contains one default export and named exports that are used to provide additional metadata about the usage of the former.


> 1. **Any default export should be a function**—ideally stateless.
> 2. **Named exports should be modifiers** for this function, consistent with the [ES Plugins](../repos/es-plugins/index.md) and [WASL](../repos/wasl/index.md) standards.

```javascript
export default (message="world") => console.log(`hello ${message}!`)
```

## Components
A **component** is an extension of the **plugin** type which specifies a logic flow between **plugin** instances in a `[name].wasl.json` file. Accompanied by a `package.json` file, **components** may use the `main` field to specify an exposed library—composed of **plugins**—for distribution on Node Package Manager (NPM).

> This is what is visualized by the Files tab of the `brainsatplay-editor`.

To be editable by `brainsatplay.editable` classes, you must have your source code accessible from Github, NPM, or other locations.

### Native vs. Mashup
**Native components** contain all of their logic internally.

``` javascript
// self-contained logic
export default (message="world") => console.log(`hello ${message}!`)
```

**Mashup components** adapt existing NPM libraries by wrapping their essential classes and function calls.

``` javascript
// external library usage
import * as graphscript from 'https://cdn.jsdelivr.net/npm/graphscript/dist/index.esm.js'
const graph = new graphscript.Graph({
    operator: (message="world") => console.log(`hello ${message}!`)
})

// encapsulated library object
export default () => graph.run('world')
```

## Graphs
A **graph** is a connected set of **plugins** that pass messages between each other. 

As specified in `.wasl.json` files, each **graph** has **nodes** and **edges**. You may think of **nodes** as the plugin instances in the graph, whereas **edges** are the flow logic that happens *between* these plugins.

```json
{
    "graph": {
        "nodes": {
            "input": {
                "src": "input.js"
            },
            "output": {
                "src": "output.js"
            },
        },
        "edges": {
            "input": {
                "output": {},
            }
        }
    }
}
```

> Nodes in the **graph** are individually visualized by the Properties tab (TBD) of the `@brainsatplay/studio`, while edges are visualized by the Graph tab.

> Although specified in the WASL standard, these are *not* handled by the [wasl](../repos/wasl/index.md) library itself. Instead, **graphs** are assembled by external libraries such as [graphscript](../repos/graphscript/index.md).


Now that you know more about the Brains@Play Framework, let's[develop your first application](./your-first-app.md)!