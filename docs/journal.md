# 2026-03-23

I also had an interesting thought just now. Certain features might be in ods with each other. For example:
- editing markdown
- undo

Or at leas I thought so. I guess it depends on how compact you want the data to be. For checkbox view it's perhaps possible to get compact undo data structure, because there's a limited set of operations (add, edit, check, ...). But for editing markdown this flies out of water and you might need to do a full snapshot, or just use the text undo system.

Some more TODOs:
- handling duplicates (I'd prefer not to have them)
- when we enter a new item in markdown `apple` the data that's actually stored is `- [ ] apple`. Which one should be put in the snapshot? I'm thinking the untransformed version, to keep the undo TRUE in markdown editor.

This is now going completely of rails, but while thinking about undo/redo I had a fun idea for how the menu would look like to have nondestructive edit history. It looks like a git comte history.

# 2026-03-21

The initial app was a bit clunky to use.
I asked next to use piccss and implement filters.
There was a problem when the items have duplicate id's in local storage.
We resolved that.

TODO:
- edit item in checkbox view
- I think I don't want duplicates
  - best would be to auto merge them, but we have to be careful how we do this
- support multiple stores (multiple indexes)
- we need to save the settings in the text view as well
- It would be nice to also support units (1, g, kg, ml, ...)
- And to support price entering prices
- Also ability to undo would be great
