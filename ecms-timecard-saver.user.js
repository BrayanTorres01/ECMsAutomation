// ==UserScript==
// @name         eCMS Timecard Saver (Auto OK Only)
// @namespace    http://tampermonkey.net/
// @version      6.3
// @description  Save and paste all timecard rows, then press OK automatically on eCMS Payroll screen (no Control button logic included). Author: Brayan
// @author       Brayan
// @match        https://cvcholdings.ecmserp.com/ecms/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function log(msg) {
        console.log('[eCMS Timecard Saver] ' + msg);
    }

    function saveTimecard() {
        let table = document.querySelector("#form1\\:subfile");
        if (!table) {
            alert("Timecard table not found.");
            return;
        }

        let timecardData = [];
        let rows = table.querySelectorAll("tbody tr");

        rows.forEach((row, rowIndex) => {
            let rowData = [];
            let fields = row.querySelectorAll("td input:not([type='hidden']), td select");

            if (fields.length === 0) return;

            fields.forEach(field => {
                rowData.push(field.value.trim());
            });

            if (rowData.length > 0) {
                timecardData.push(rowData);
                log(`Row ${rowIndex + 1} saved (${rowData.length} inputs): ${JSON.stringify(rowData)}`);
            }
        });

        if (timecardData.length === 0) {
            alert("No timecard data found to save.");
            return;
        }

        localStorage.removeItem("savedTimecard");
        localStorage.setItem("savedTimecard", JSON.stringify(timecardData));
        alert("Timecard saved successfully.");
        log(`Saved JSON data: ${JSON.stringify(timecardData)}`);

        // Click OK button only
        let okBtn = document.querySelector("#form1\\:CFEN");
        if (okBtn) {
            log("Clicking OK button after save...");
            okBtn.click();
        } else {
            log("OK button not found.");
        }
    }

    function pasteTimecard() {
        let table = document.querySelector("#form1\\:subfile");
        if (!table) {
            alert("Timecard table not found.");
            return;
        }

        let savedData = localStorage.getItem("savedTimecard");
        if (!savedData) {
            alert("No saved timecard found.");
            return;
        }

        try {
            log("Raw saved data before parsing: " + savedData);
            let parsedData = JSON.parse(savedData);

            if (typeof parsedData === "string") {
                parsedData = JSON.parse(parsedData);
                log("Parsed data was double-stringified. Parsed again.");
            }

            if (!Array.isArray(parsedData)) {
                throw new Error("Parsed data is not an array.");
            }

            let rows = table.querySelectorAll("tbody tr");

            parsedData.forEach((savedRow, rowIndex) => {
                let row = rows[rowIndex];
                if (!row) return;

                let inputs = row.querySelectorAll("td input:not([type='hidden']), td select");

                if (savedRow.length !== inputs.length) {
                    log(`Row ${rowIndex + 1} field mismatch: saved ${savedRow.length}, found ${inputs.length}`);
                    return;
                }

                savedRow.forEach((value, inputIndex) => {
                    if (inputs[inputIndex]) {
                        inputs[inputIndex].value = value;
                    }
                });

                log(`Row ${rowIndex + 1} pasted successfully.`);
            });

            alert(`${parsedData.length} rows pasted successfully.`);
        } catch (error) {
            localStorage.removeItem("savedTimecard");
            alert("Invalid timecard data format. Saved data has been cleared.");
            console.error("Error parsing data: " + error.message);
        }
    }

    function addButtons() {
        if (document.getElementById("ecms-timecard-toolbar")) return;

        let header = document.body;

        let btnContainer = document.createElement("div");
        btnContainer.id = "ecms-timecard-toolbar";
        btnContainer.style.position = "fixed";
        btnContainer.style.top = "10px";
        btnContainer.style.right = "10px";
        btnContainer.style.zIndex = "9999";
        btnContainer.style.background = "white";
        btnContainer.style.padding = "10px";
        btnContainer.style.border = "2px solid black";
        btnContainer.style.borderRadius = "5px";
        btnContainer.style.boxShadow = "2px 2px 10px rgba(0,0,0,0.3)";

        let saveButton = document.createElement("button");
        saveButton.innerText = "Save Timecard";
        saveButton.style.margin = "5px";
        saveButton.onclick = saveTimecard;

        let pasteButton = document.createElement("button");
        pasteButton.innerText = "Paste All Timecard Rows";
        pasteButton.style.margin = "5px";
        pasteButton.onclick = pasteTimecard;

        btnContainer.appendChild(saveButton);
        btnContainer.appendChild(pasteButton);
        header.appendChild(btnContainer);
    }

    function observeDOM() {
        const observer = new MutationObserver(() => {
            addButtons();
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener("load", () => {
        addButtons();
        observeDOM();
    });

})();