import showdown from 'showdown'

// Valid Options: https://github.com/showdownjs/showdown#valid-options
export const converter = new showdown.Converter({
    tables: true,
    tasklists: true,
    emoji: true,
    moreStyling: true
    // metadata: true
});

converter.setFlavor('github');

