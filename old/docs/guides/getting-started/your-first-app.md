---
sidebar_position: 3
title: Your First App
---

This tutorial will use the [Phaser](https://phaser.io/) library (v3) to introduce the core concepts of the Brains@Play Framework through a complete example.

> **Note:** The code for this tutorial can be found at https://github.com/garrettmflynn/phaser.

## A Tour of the Components
We have created a [mashup component](./conventions.md#native-vs-mashup) to simplify the process of working with Phaser.

### phaser
This component is a **Factory** for the global `Phaser` variable loaded asynchronously with a `script` tag.

#### Full Code
```javascript title="phaser/components/phaser/index.js"
const script = document.createElement('script')
script.src = 'https://cdn.jsdelivr.net/npm/phaser@3.55.2/dist/phaser-arcade-physics.min.js'
document.head.appendChild(script)

let nodes = {}
let onResolve = null
script.onload = function () {
    if (onResolve instanceof Function) onResolve(window.Phaser)
    for (let tag in nodes)  nodes[tag].run()
};

export function oncreate() {
    if (window.Phaser) this.run()
    else nodes[node.tag] = this
}

export default () => {
    if (window.Phaser) return window.Phaser
    else return new Promise(resolve => onResolve = resolve)
}
```

#### Detailed Explanation
##### External Library Import
```javascript
const script = document.createElement('script')
script.src = 'https://cdn.jsdelivr.net/npm/phaser@3.55.2/dist/phaser-arcade-physics.min.js'
document.head.appendChild(script)

// ...

script.onload = function () {
    if (onResolve instanceof Function) onResolve(window.Phaser)
    for (let tag in nodes)  nodes[tag].run()
};
``` 

This snippet asynchronously loads Phaser as a `window` variable into the page. Once loaded, the default export for this component will be forwarded to any children. 

The `onResolve` function ensures that requests made before the availability of `window.Phaser` will be passed properly.

##### Node Registration
```javascript
export function oncreate() {
    if (window.Phaser) this.run()
    else nodes[this.tag] = this
}
```

This snippet collects graph nodes (using the `this` keyword) for later activation in the `script.onload` function—or simply runs the node if `window.Phaser` is available.

> **Note:** The `this` keyword specifies the parent object of a function. In `graphscript`, the underlying library for `brainsatplay`, this is always the GraphNode that controls the component execution.


##### Simple Forwarding Function
```javascript
export default () => {
    if (window.Phaser) return window.Phaser
    else return new Promise(resolve => onResolve = resolve)
}
```

This snippet forwards `window.Phaser` to all children.

### config
#### Full Code
```javascript title="phaser/components/config/index.js"
import merge from './merge.js';  // A module that merges two object
import defaultConfig from './phaser.config.js' // A default configuration file for Phaser

export const content = defaultConfig
export default function (node) {
    if (window.Phaser) {
        config = merge(defaultConfig, this.content) // merge config with default config
        config.parent =  node.graph.parentNode // set parent node
        return config
    }
}
```

#### Detailed Explanation
##### Custom Instance Keys
```javascript
export const content = defaultConfig
```

This snippet adds a custom key (**content**) to each component instance, which allows users to specify a configuration object from inside WASL files.

##### Using a Default Template
```javascript
export default function (node) {
    if (window.Phaser) {
         let cfg = (typeof this.content === 'function') ? this.content(window.Phaser) : this.content;
        let defaultCfg = (typeof content === 'function') ? content(window.Phaser) : content;
        let config = merge(defaultCfg, cfg)
        config.parent =  node.graph.parentNode
        return config
    }
}
```

This snippet uses a regular (as opposed to [arrow](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions)) function and the `this` keyword to access a user-specified configuration and options object. These are then merged with the default objects.

`config` can be a function to allow for proper linking of game assets using the `this.options.baseURL` value.

##### Accessing a `graphscript` Node
Importantly, this snippet also uses the `node` keyword to request the active `graphscript` node for use in the function. In this way, the `parentNode` of the current node's graph is assigned as the `parent` in the Phaser configuration object. This allows the game itself to be placed inside the instance's representation on the webpage.

### game
#### Full Code
```javascript title="phaser/components/game/index.js"
export default (config) => new Phaser.Game(config);
```

#### Detailed Explanation
As the simplest component of this collection, this simply creates a `Phaser.Game` instance that is added to the webpage (based on the aforementioned `parent` key) and forwarded to any children.

## Assembling the Component
This component is a simple series of the aforementioned components.

```json title="phaser/index.wasl.json"
{
    "graph": {

        "nodes": {
            "phaserObject": {
                "src": "components/phaser/index.js"
            },
            "config": {
                "src": "components/config/index.js"
            },
            "game": {
                "src": "components/game/index.js"
            }
        },
        "edges": {
            "phaserObject": {
                "config": {},
            },
            "config": {
                "game": {}
            }
        }
    }
}
```

## `phaser` Component Usage
To instantiate a Phaser game in your app, you may add this node to your `index.wasl.json` file: 

```json title="index.wasl.json"
{
    "graph": {

        "nodes": {
            "phaser": {
                "src": "phaser/index.wasl.json",
            }
        },

        "edges": {}
    }
}
```

### Modifying the `phaser` Component
To modify `phaser` for your app, add the `components` field under `graph.nodes.phaser`. This will allow you to merge your `content` information with the default.

```json
{
    "graph": {

        "nodes": {
            "phaser": {
                "src": "phaser/index.wasl.json",
                "components": {
                    "config": {
                        "content": {
                            "physics": {
                                "arcade": {
                                    "gravity": {
                                        "y": 20000
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },

        "edges": {}
    }
}
```

## Running WASL with `brainsatplay`
The following HTML document can be used to run your WASL app.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Phaser App</title>
</head>
<body>
    <div></div>
</body>
<script type="module">

    import * as brainsatplay from 'https://cdn.jsdelivr.net/npm/brainsatplay/dist/index.esm.js'

    const app = new brainsatplay.App('./index.wasl.json', {
        relativeTo: import.meta.url
    })    

    const ui = document.querySelector('div')
    ui.style.width = '100vw'
    ui.style.height = '100vh'
    app.setParent(ui)

    app.start().then(ok => {
        if (ok) console.log('App started', app)
        else console.log('App failed', app)
    }).catch(e => console.error('Invalid App', e))

</script>

</html>
```

#### Import Mode
If your app components are served to the browser alongside the HTML document, you may use **import mode** to dynamically import these components using the relative path from the HTML file and the `import.meta.url` variable, which indicates the location of the current script in the browser filesystem.

#### Reference Mode
If you cannot use **import mode** (e.g. your application is housed in a sibling repository), you may also use **reference mode** to provide object references to all the files that compose it.

```javascript
import info from '../../phaser/index.wasl.json' assert {type: "json"}
import phaserInfo from '../../phaser/src/index.wasl.json' assert {type: "json"}

import pkg from '../../phaser/package.json'  assert {type: "json"}
import phaserPkg from '../../phaser/src/package.json'  assert {type: "json"}
import * as phaser from  '../../phaser/src/components/phaser/index.js'
import * as config from  '../../phaser/src/components/config/index.js'
import * as game from  '../../phaser/src/components/game/index.js'

const path = '../../phaser/index.wasl.json'

const options = {
    filesystem: {
        'package.json': pkg,
        'src/package.json': phaserPkg,
        'src/index.wasl.json': phaserInfo,
        'src/components/phaser/index.js': phaser,
        'src/components/config/index.js': config,
        'src/components/game/index.js': game
    }
}

const app = new brainsatplay.App(info, options)   
```

After serving this HTML document, you should have an active version of the default `phaser` game running!


## Programming with the `phaser` Component
#### Linking to Code Files
If you have ESM files (e.g. with functions) that you'd like to import into a component, you may simply provide URIs linking to those components:

> **Note:** This will provide the *default* export if available. Otherwise all named exports will be added to the object.

```json
{
    "graph": {

        "nodes": {
            "phaser": {
                "src": "phaser/index.wasl.json",
                "components": {
                    "config": {
                        "content": {
                            "physics": {
                                "arcade": {
                                    "gravity": {
                                        "y": 20000
                                    }
                                },
                                "scene": {
                                    "key": "main",
                                    "preload": {
                                        "src": "./scripts/update.js"
                                    },
                                    "create": {
                                        "src": "./scripts/create.js"
                                    },
                                    "update": {
                                        "src": "./scripts/update.js"
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
```

To see this code in action, clone the https://github.com/brainsatplay/phaser repo.

### A Note on Internal Imports (remote components only)
Internal imports are defined as ESM imports that sit within a src file linked in a `.wasl.json` file. For example, `index.wasl.json` has a node with src=`https://example.com/index.js`. This file has an **internal import** of `variables.js`.

``` javascript title="https://example.com/index.js"
import { increment } from 'variables.js'
import func from 'variables.js'

export default () => {
    const newIncrement = func()
    console.log(increment === newIncrement)
    return newIncrement
}
```

`wasl` imports remote components as text before converting them to a datauri that can be imported using the `import()` function. While we can create a registry of imported modules (allowing for shared static references), **certain ways of importing variables are not supported** since they will break ESM [live bindings](https://stackoverflow.com/questions/52211309/what-does-it-mean-by-live-bindings).

As such, **you might discover that your variables are not mutable.** If the `variables.js` file xontains:

``` javascript title="variables.js"
export const increment = 0

export default const func = () => {
    increment = increment + 1
    return increment
}
```

Then the equality of **increment** and **newIncrement** logged by `https://example.com/index.js` would always be **false**.

#### How to Support Mutable States
To remove this issue, make sure to export modules that will have shared *and* mutable states using [namespace import syntax](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import#namespace_import):

``` javascript title="https://example.com/index.js"
import * as variables from 'variables.js'
import func from 'variables.js'

export default () => {
    const newIncrement = func()
    console.log(variables.increment === newIncrement)
    return newIncrement
}
```