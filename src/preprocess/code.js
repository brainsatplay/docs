export default (text) => {

        // Strict regex to match headers above code blocks
        const codeMatches = text.matchAll(/(?:#+\s(\S+)\n)?```([a-z]+)\n([\s\S]*?\n)```/g) // Is required to have syntax highlighting note

        for (let match of codeMatches) {
            const name = match[1] ? match[1].trim() : match[1]
            const language = match[2] ? match[2].trim() : match[2]
            const code = match[3]

            // Instantiate Editors
            if (name && language && code) {
                // console.log(`Should load ${name} (${language}) into WASL`)
                // if (name.includes('.wasl.json')) {
                //     console.log('Should bind above Components to this WASL file', text)
                // } else console.log(code)
            } 
            
            // Wrap Code with Editor View
            text = text.replace(match[0], `<div class="brainsatplay-docs-code"><span>${name ?? 'Code'}</span>\n<pre><code>${code}</code></pre></div>`)

        }

        return text
}