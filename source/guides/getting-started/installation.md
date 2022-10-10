# Installation
To begin a new project in the Brains@Play Framework, you'll need to include the [WASL](https://github.com/brainsatplay/wasl/blob/main/README.md) library in you JavaScript code. This can be done in a few different ways, depending on the needs of your project.

If you're using a standalone HTML page, it may be easiest to include WASL as a global variable using a **script tag**:
```html
<script src="https://cdn.jsdelivr.net/npm/wasl@latest"></script> 
<script> console.log(wasl) </script>
```

As you get more familiar with ES Module syntax, however, it will be best to use ESM import syntax to include the library. This will work in browser and Node.js (v14+):
``` js
import * as wasl from 'https://cdn.jsdelivr.net/npm/wasl@latest/dist/index.esm.js' // Downloaded from a CDN
// import * as wasl from 'wasl' // Contained in Node Modules
console.log(wasl)
```

Internally, we'll start our projects using the [WASL Starter Kit](https://github.com/brainsatplay/wasl-starter-kit). This template repository is preconfigured with an HTML file that compiles a template WASL application. Just serve the `index.html` file and edit the `app` folder to change its behavior!

---

After you've organized your project in the Brains@Play Framework, you're going to need to [familiarize yourself with a few conventions](./conventions.md) before you develop your first application!