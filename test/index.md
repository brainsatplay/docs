# Testing WASL Interactive Demo

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