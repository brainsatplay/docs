# Your First Component
This tutorial will guide you through the design of our generic [button](https://github.com/brainsatplay/components/blob/main/components/ui/button.js) component.

## Initialize your Repository
Follow the steps in the [installation](./installation.md) documentation to get started with a new WASL project.

## Mockup the App Logic
In the `index.wasl.json` file targeted in your project, we'll begin by outlining the behavior of our application: the creation of a button. Since we're just trying to produce a single plugin, this will be quite simple: 

```json
{
    "components": {
        "button": {
            "src": "./components/button.js"
        }
    }
}
```

## Create a Simple Component
After creating the expected `components/button.js` file, you'll specify the `tagName` keyword and some element `attributes` to begin working with WASL Components.

```js
export const tagName = 'button' // Attach this component to a button element
export const attributes = {
    "innerText": "Click Me" // Set default text
}
```

If you refresh the HTML page, you'll now see that a button has been created on screen! However, it's not doing much right now. Let's see if we can pass the `onclick` event to another component. 

To do this, we'll use the default `log` plugin provided in the [components](https://github.com/brainsatplay/escode/blob/main/components) repository:
```json
{
    "components": {
        "button": {
            "src": "./components/button.js"
        },
        "log": {
            "src": "https://raw.githubusercontent.com/brainsatplay/components/main/components/wasl/log.js"
        }
    }
}
```

To get these components to talk to each other, we'll need to define a **listener** that will pass the output of `button` to `log`.
```json
{
    "components": {
        "button": {
            "src": "./components/button.js"
        },
        "log": {
            "src": "ttps://raw.githubusercontent.com/brainsatplay/components/main/components/wasl/log.js"
        }
    },
    "listeners": {
        "button": {
            "log": true
        }
    }
}
```

To get the `button` to pass information to the `log` Component, we'll need to define two more things: 
1. A default function used by `button` when it is triggered internally or by another Component
2. An `onmousedown` event that internally triggers this default function when the mouse has been pressed

Thankfully, the underlying logic framework for WASL ([grpahscript](https://github.com/brainsatplay/graphscript)) already assigns a basic default function for us:

```js
export default (input) => input // This default function is specified by graphscript and will forward any input to this Component to any linked Components.
```

However, we still need to manually trigger this function with an `onmousedown` event:

```js
//  ...
export const attributes = {
    "innerHTML": "Click Me"
    onmousedown: function () {
        this.run(true) // Run the default function of the WASL Component
        const onMouseUp = () => {
            this.run(false) // Notify when the mouse has been released
            globalThis.removeEventListener('mouseup', onMouseUp) // Stop monitoring for the mouseup event
        }
        globalThis.addEventListener('mouseup', onMouseUp) // Monitor when the user releases the mouse
    }
}
//  ...
```

At this point, you should be able to click on the button and get its state to print to the Developer Console!

And with that, we have a ready-to-use `button` component for anyone using the Brains@Play Framework!

## Further Considerations
### Changing Default Properties
In many cases, the end-user of your Component would like to customize certain aspects of it for their application. For instance, I might want my button to say `Submit Form` rather than the default `Click Me` text we have defined here. 

To override any property of a Component, you can simply declare that property in the associated WASL file:

```json
{
    "components": {
        "button": {
            "attributes": {
                "innerText": "Submit Form"
            },
            "src": "./components/button.js"
        },
        "log": {
            "src": "ttps://raw.githubusercontent.com/brainsatplay/components/main/components/wasl/log.js"
        }
    },
    "listeners": {
        "button": {
            "log": true
        }
    }
}
```

### Storing a Passed Value
In many cases, a user will want to use a button to **submit** a selected item. In this case, it would be useful for the `button` to store the last value passed to it. 

For this to happen, however, we'll need to discriminate between internal **trigger** events and external **set** events:

```js
// ...
export const attributes = {
    "innerHTML": "Click Me",
    onmousedown: function () {
        this.run({value: true, _internal: true}) // Pass the value of the command with an _internal flag
        const onMouseUp = () => {
            this.run({value: false, _internal: true})
            globalThis.removeEventListener('mouseup', onMouseUp)
        }
        globalThis.addEventListener('mouseup', onMouseUp)
    }
}

export let cache = null // Store the last value passed to the Component

export default function (input){

    const value = input?.value ?? input // Grab the passed value
    const isInternal = input?._internal // Check if the input was internal or external

    // Pass the cached value for the Component when it is pressed
    if (isInternal) {
        if (this.cache) {
            if (value) return this.cache // Establish a new behavior where the cahched value is returned when the button is pressed
        } else return value // Maintain previous behavior by notifying when the button is (un)pressed.
    }
    
    // Set the cache with external values
    else if (value) this.cache = value
}
```

With these changes, our `button` Component can now be used for more use-cases!

---

In the next section, we'll [develop a simple todo app](./application.md) using this `button` Component.





*coming soon*