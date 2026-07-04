const notes = [];

function addNote(title, body) {
  const note = {
    id: Date.now().toString(),
    title,
    body,
    createdAt: new Date().toISOString()
  };

  notes.push(note);
  return note;
}

function searchNotes(query) {
  return notes.filter((note) => note.title.includes(query) || note.body.includes(query));
}

function removeNote(id) {
  const index = notes.findIndex((note) => note.id === id);

  if (index === -1) {
    return false;
  }

  notes.splice(index, 1);
  return true;
}

module.exports = {
  addNote,
  searchNotes,
  removeNote
};
