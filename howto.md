## Our Goal

We want to create a Qualtrics survey where some fields are pre-populated for each participant id based on an external .csv file, where each participant id corresponds to a unique data field. Below are the steps to do it:


We have a CSV file (e.g. `opinions.csv`) with two columns:

```
participantId,opinion
P001,"Social media should restrict political ads..."
P002,"Freedom of speech is the most important right..."
```

We want our Qualtrics survey JavaScript to:

1. Generate a unique survey link for each participant Use Qualtrics Contact List + Personal Links (secure and automatic)
2. In the survey, fetch the external CSV securely, and look up the participant’s opinion text by their `participantId`.
3. Display that text in a question.

---

## Step 1. Host the data file in a secure server 

Since the data is sensitive, the easiest way is to host it on Qualtrics File Library. 
We can upload a JSON or CSV 
1. Go to **Library → New Resource** → name it accordingly (i.e., `opinions`) → **Upload File**
2. Fetch the file URL: **Click on the file → Right click on View → Copy Link Address**. The link would look like `https://qualtrics.com/...File.php?F=...`.


## Step 2. Reference the data in the survey 

To reference the data, we need to generate unique **personal survey links that include (or at least embed) each participant’s ID**. We can extract the participant IDs from the link, then use JS code to look up the participant's data from the table we just hosted.

### Step 2.1.: Create a Contact List

Prepare a CSV with at least 2 identical columns:

```csv
ExternalDataReference,participantId
P001,P001
P002,P002
P003,P003
```

Notes:
* `ExternalDataReference` is crucial — it becomes the internal key for each respondent.
* `participantId` is an optional custom field --- in our case, it is the unique identifier for each participant.

Then:

1. Go to **Directories → Create A List** → name it accordingly (i.e., `wave_1_contacts`).
2. Click **Import Contacts → Upload File → your CSV.**
3. Verify that columns mapped correctly (`ExternalDataReference` should map to the right header).

---

### Step 2.2: Link the Contact List to Your Survey

1. Go to your **survey → Distributions → Personal Links** (Qualtrics will ask you to publish the survey first).
2. Choose “Create Personal Links.”
3. Select your contact list `wave_1_contacts`.
4. Qualtrics will automatically generate one **unique survey link per participant**.

Each link will look something like this:

```
https://iu.co1.qualtrics.com/jfe/form/SV_7UGgZ2jobRHG6ge?Q_DL=47gajkZb1YJrTQ6_7UGgZ2jobRHG6ge_CGC_XXXX
```

These links already *embed the participant’s ExternalDataReference* (P001, P002, etc.) internally — you don’t need to add anything else.

---

### Step 2.3: Capture the participantId in Survey Flow

Go to **Survey Flow** → at the top → **Add New Element → Embedded Data**:

| Field Name    | Value                              |
| ------------- | ---------------------------------- |
| wave2_pid | ${e://Field/ExternalDataReference} |

This automatically extracts the participant’s ID from their personal link and stores it in the survey.

---

### Step 2.4: Use participant data 

Now you can reference the ID using:

```
${e://Field/wave2_pid}
```

Example:
```
> You are participant **${e://Field/participantId}**.
> Here is your assigned statement: ${e://Field/opinionText}
```

In our case, we simply want to display the participant's ID and their previous opinion. Use the JS code to do so

```
Qualtrics.SurveyEngine.addOnReady(function() {
  var pid = Qualtrics.SurveyEngine.getEmbeddedData('wave2_pid')
  console.log("wave2_pid", pid)

  var csvUrl = "https://iu.co1.qualtrics.com/ControlPanel/File.php?F=F_OBQK2u3DaBo7X1G";

  // CSV-safe split that respects quotes
  function splitCSV(line) {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        // toggle on quote, or skip escaped ""
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQ = !inQ; }
      } else if (ch === ',' && !inQ) {
        out.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  // Trim + strip surrounding quotes
  function cleanCell(s) {
    if (s == null) return '';
    s = String(s).trim().replace(/^\uFEFF/, ''); // drop BOM if present
    if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
    return s.trim();
  }

  fetch(csvUrl)
    .then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    })
    .then(text => {
      // Normalize newlines, drop blank lines
      const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
                        .split('\n').filter(l => l.trim().length > 0);
      if (lines.length < 2) throw new Error("CSV has no data rows.");

      // Normalize headers: trim + lower-case for matching
      const rawHeaders = splitCSV(lines[0]).map(cleanCell);
      const hdrIndex = {};
      rawHeaders.forEach((h, i) => { hdrIndex[h.toLowerCase()] = i; });

      const idIndex = hdrIndex['participantid'];
      const opinionIndex = hdrIndex['initial_opinion']; // <-- match your exact column name

      if (idIndex == null || opinionIndex == null) {
        console.error("Headers found:", rawHeaders);
        throw new Error("CSV missing required headers 'participantId' and/or 'initial_opinion'.");
      }

      let foundOpinion = null;

      for (let i = 1; i < lines.length; i++) {
        const cols = splitCSV(lines[i]).map(cleanCell);

        // Skip short / malformed rows
        if (cols.length <= Math.max(idIndex, opinionIndex)) continue;

        const rowId = cols[idIndex];
        if (!rowId) continue;

        if (rowId === pid) {
          foundOpinion = cols[opinionIndex] || '';
          break;
        }
      }

      const target = document.querySelector('.QuestionText') || document.body;

      if (foundOpinion && foundOpinion.length > 0) {
        target.innerText = "You are participant #" + pid + "\nThis is your previous opinion: " + foundOpinion;
        Qualtrics.SurveyEngine.setEmbeddedData('opinionText', foundOpinion);
      } else {
        target.innerText = "Error: Opinion not found for ID " + pid;
      }
    })
    .catch(err => {
      console.error("Error fetching CSV:", err);
      const target = document.querySelector('.QuestionText') || document.body;
      target.innerText = "Error loading opinion data.";
    });
});
```

### Sanity check: 
- In Step 2.2, you will have already downloaded a .csv file containing the unique links for each participant. It should be named something like this: `export-XXX-2025-10-11T08-28-28-612Z.csv`
- Try to access somme links in `Link` field. The displayed text should be different for each link.


---


## Step 3: Distribute the survey using Export Links

- Publish the survey again 
- Distribute the survey using the links downloaded: 
* Go to **Distributions → Personal Links → Download Links.**
* You’ll get a CSV with each participant’s personal link next to their `ExternalDataReference` (i.e., participantId).
* You can then distribute those manually, via Prolific, or email.
