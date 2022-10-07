# Brains@Play: Recompose the Web
**The Brains@Play Framework (Brains@Play) is a copyleft rapid application development (RAD) system** for high-performance web applications. Using a [custom specification language](https://github.com/brainsatplay/wasl/blob/main/README.md) and native ECMAScript Modules syntax, we automate inspectability and composability for the developer in order to enable the proliferation of reusable code blocks and the recomposition of the Open Web.

## From Modules to Components 
With the release of ECMAScript 2015 (ES6), ECMAScript Modules (ES Modules) became the standard format to package JavaScript code for reuse and provide modularity to the Web.

#### messages.js
```javascript
export const world = () => console.log('hello world!')
export const friend = () => console.log('hello friend!')
```

#### hello.js
```javascript
import * as hello from './hello.js'
hello.world()
hello.friend()
```

However, since ES Modules didn't standardize the exported code itself, there remains a lack of support for immediate composability.

> If you're most interested purely in scalable UI management, the Brains@Play Framework might not be for you; in this case, you might want to check out [React](https://reactjs.org/), [Vue](https://vuejs.org/), [Svelte](https://svelte.dev/), [Angular](https://angular.io/) or the vast array of other UI frameworks). On the other hand, **this framework is particularly suited for organizing and sharing code at scale**. If you're interested, read on!

### Thinking in Datastreams
We believe that the most general solutions are the best solutions—period. As such, the Brains@Play Framework inherits from the **datastream** programming paradigm, which models programs as directed graphs of data flowing between operations. 

Within this paradigm, you can use native ESM modules to produce reusable **Components** (either simple objects or complete [Web Components](https://developer.mozilla.org/en-US/docs/Web/Web_Components)) that are characterized by a **default** operation. 

By design, default exports are distinguished by ES Modules—not only our framework.

#### trigger.js
```javascript
export const loop = 1000/10
export default () => true
```

#### hello.js
```javascript
export default (message="world") => console.log(`hello ${message}!`)
```

Using the [Web Application Specification Language (WASL)](https://github.com/brainsatplay/wasl/blob/main/README.md), you're then able to instantiate Components and define listeners that control the information flow between them.

##### index.wasl.json
```json
{
    "name": "My App",
    "components": {
        "trigger": {
            "src": "trigger.js"
        },
        "hello": {
            "src": "hello.js"
        }
    },
     "listeners": {
        "trigger": {
            "hello": true
        }
    }
}
```

In our experience, we've found the Brains@Play Framework most useful for high-throughput, real-time applications (e.g. processing brain data streamed from an electroencephalography (EEG) device at 512hz, which is translated into UI changes that inform the user about their internal state). But we're excited to see the use-cases you all dream up for it!

In the near future, you will be able to use our visual programming system ([@brainsatplay/studio]) for intuitive inspection, modification, and extension of WASL applications using our official [components] collection.

## Playing with Code
Brains@Play embodies our desire to support the joy of developers as they create high-performance applications. It encompasses many different goals including **free software use**, **inspectability** and, **composability**

More generally, Brains@Play refers to the culture of rapid prototyping that permeates the project through the composition of simple plugins without the need to focus on unneccesary complexity.

Our team, in particular, has a soft spot for **accessibility** concerns that support everyone with a brain, as the majority of our [day-to-day work](./projects.md) focuses on the development of web-based physiological computing software and low-cost biosensing hardware.

## Audience
This documentation is written for **programmers who care about the future of composability**. We assume that you can read JavaScript code—as all of the examples here are written for the browser (specifically the latest Chromium browsers) or Node.js. Other than that basic background, we try to present all the concepts you will need to play with the Brains@Play Framework.

## Meet your Maintainers!
The Brains@Play Framework and [all of its its dependencies](./repos/index.md) have been released under the [AGPLv3](https://www.gnu.org/licenses/agpl-3.0.en.html) license. It is maintained by [Brains@Play LLC](https://brainsatplay.com) and its founding partners:

- [Garrett Flynn](https://github.com/garrettmflynn) is a transdisciplinary researcher and web engineer living in Los Angeles, California.
- [Josh Brewster](https://github.com/joshbrew) is a mad scientist living in Oregon.

Keep reading to [install the Brains@Play Framework](./guides/getting-started/installation.md) and develop your first application!

[brainsatplay]: https://github.com/brainsatplay/brainsatplay/blob/main/README.md

<!-- Specification Language -->
[wasl]: https://github.com/brainsatplay/wasl/blob/main/README.md

<!-- Core Library-->
[graphscript]: https://github.com/brainsatplay/graphscript/blob/master/README.md

<!-- Integrated Editor-->
[@brainsatplay/studio]: https://github.com/brainsatplay/studio/blob/main/README.md

<!-- Low Code Programming System-->
[visualscript]: https://github.com/brainsatplay/visualscript/blob/main/README.md

<!-- Data Acquisition-->
[datastreams-api]: https://github.com/brainsatplay/datastreams-api/blob/main/README.md

<!-- Build Tool-->
[tinybuild]: https://github.com/brainsatplay/tinybuild/blob/master/README.md

<!-- Plugin Registry -->
[components]: https://github.com/brainsatplay/components/blob/main/README.md

[es-plugins]: https://github.com/brainsatplay/es-plugins/blob/main/README.md