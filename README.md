# Document Hub

A complete Node.js + Express + SQLite PDF management website.

## Features

- CV & ML, SSP and FSD sections
- Section toggle during upload
- PDF-only upload validation
- 20 MB upload limit
- Stores PDFs in separate folders
- Stores document metadata in SQLite
- Open PDF
- Download PDF
- Delete PDF and its database record
- Search/filter by section
- Responsive modern UI
- Drag-and-drop PDF selection

## Requirements

Install Node.js (LTS recommended).

## Run

Open a terminal in this project folder:

```bash
npm install
npm start
```

Then open:

http://localhost:5000

## Storage

Uploaded files are stored here:

```text
uploads/cv-ml/
uploads/ssp/
uploads/fsd/
```

Document information is stored in:

```text
database.db
```

## Important

Do not delete `database.db` if you want to keep your document records.

Do not delete the `uploads` folder if you want to keep the uploaded PDFs.
