import { Plugin, SpecialCharacters } from "ckeditor5";

export default class SpecialCharactersEmojiPlugin extends Plugin {

    static get requires() {
        return [ SpecialCharacters ];
    }

    init() {
        this.editor.plugins.get('SpecialCharacters').addItems('Emoji', [
            { title: 'smiley face', character: '😊' },
            { title: 'grinning face', character: '😄' },
            { title: 'grinning face with big eyes', character: '😃' },
            { title: 'grinning face with sweat', character: '😅' },
            { title: 'beaming face with smiling eyes', character: '😃' },
            { title: 'neutral face', character: '😐' },
            { title: 'rolling on the floor laughing', character: '🤣' },
            { title: 'face with tears of joy', character: '😂' },
            { title: 'heart', character: '❤️' },
            { title: 'hands pressed together', character: '🙏' },
            { title: 'thumbs up', character: '👍' },
            { title: 'rocket', character: '🚀' },
            { title: '100', character: '💯' },
            { title: 'wind blowing face', character: '🌬️' },
            { title: 'floppy disk', character: '💾' }
        ], { label: 'Emoji' });
    }

}
