# Your First Application
This tutorial is inspired by a wonderful video by [Fireship](https://www.youtube.com/watch?v=cuHDQhDhvPE) where the same **todo application** is built using ten different frameworks.

> Check out the working code for this example on the live [WASL Components Demo](https://brainsatplay.com/components/) website.

## Defining the Application Logic
Before we get started with more Components, we'll need to determine how the information of our application should flow. 

In general, we will input our todo item into an `input` tag. When we're ready to submit, we'll press a `button` that send this new item to the UI `list` to be displayed and the LocalStorage API to `store` as "todos" for later page reloads. When the page is reloaded, then, the LocalStorage API should `load` the previous "todos" into the `list`.

Translated into a WASL file, our application looks something like this:

##### index.wasl.json
```json
{
    "components": {
        "input": {
            "src": "./components/ui/input.js"
        },
        "button": {
            "attributes": {
                "innerHTML": "Add Todo",
                "type": "submit"
            },
            "src": "./components/ui/button.js"
        },
        "list": {
            "src": "./components/ui/ul.js"
        },
        "store": {
            "src": "./components/storage/local/set.js"
        },
        "load": {
            "arguments": {
                "key": "todos"
            },
            "src": "./components/storage/local/get.js"
        }
    },
    "listeners": {
        "input": {
            "button": true
        },
        "button": {
            "list": true
        },
        "list": {
            "store": true
        },
        "load": {
            "list": true
        },
    }
}
```

We can use the `button` Component we'd specified in the [previous tutorial](./component.md)—but otherwise we'll need to define more Components from scratch!

## Defining the Components
### Input
The `input` Component is going to be relatively similar to the `button` component—although external inputs are going to reset the current input value before being passed on.

##### input.js
```js
export const tagName = 'input' // Specify the HTML Element
export const attributes = {
    oninput: function (ev) {
        this.run({value: ev.target.value, _internal: true}) // Activate with new inputs
    }
}

export default function (input){
    if (input?._internal) return input.value // Pass input to linked Components
    else {
        this.element.value = input // Set the value of the input
        return input // Pass to linked Components
    }
}
```

### List
The `list` Component, on the other hand, is going to accumulate inputs, both on the DOM and inside an Array that is passed to linked Components.

##### ul.js
```js
export const tagName = 'ul' // Specify the HTML Element
export const items = [] // Maintain a list of items
export default function (...args) {
    const inputs = args.flat() // Treat all arguments as single list items
    inputs.forEach(input => {
        if (typeof input === 'string'){ // Only allow strings
            const li = document.createElement('li')
            li.innerText = input
            this.element.appendChild(li) // Add list item to the DOM
            items.push(input) // Record new list item in the Array
        }
    })
    return [items]
}
```

### Store
The `store` Component will require a basic call **set the item in storage** using the LocalStorage API.

##### set.js
```js
export default (value, key='todos') => {
    const string = JSON.stringify(value) // Parse input into a string.
    localStorage.setItem(key, string) // Store string in Local Storage.
}
```

### Load
Similarly, the `load` Component will **get the item from storage** and parse it into a JavaScript object.

##### get.js
```js
export default (key='todos') => {
    let item = localStorage.getItem(key) // Get key from local storage.
    item = JSON.parse(item) // Parse the string into a JavaScript Object.
    return (item === null) ? undefined : item // Return values that are not null
}
```

## Final Notes
Now that you've completed all of your Components, you should be able to run the application and create your own todo lists. Huzzah!

In our next tutorial, we'll see how what you've learned will generalize to [real-time signals](./realtime.md) (coming soon...).