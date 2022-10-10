# Testing WASL Interactive Demo

## Meet your Maintainers!
The Brains@Play Framework and [all of its its dependencies](./repos/index.md) have been released under the [AGPLv3](https://www.gnu.org/licenses/agpl-3.0.en.html) license. It is maintained by [Brains@Play LLC](https://brainsatplay.com) and its founding partners:

```javascript
export const world = () => console.log('hello world!')
export const friend = () => console.log('hello friend!')
```

```javascript
import * as hello from './hello.js'
hello.world()
hello.friend()
```

#### trigger.js
```javascript
export const loop = 1000/10
export default () => true
```

#### hello.js
```javascript
export default (message="world") => console.log(`hello ${message}!`)
```

#### index.wasl.json
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