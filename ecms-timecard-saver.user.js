// ==UserScript==
// @name         eCMS Timecard Saver
// @namespace    http://tampermonkey.net/
// @version      8.4
// @description  Saves & pastes selected fields in timecard. Mouse Button 4 = Paste, 5 = Save. Author: Brayan
// @author       Brayan
// @match        https://cvcholdings.ecmserp.com/ecms/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = "savedTimecard";
    const FIELD_INDEXES_TO_COPY = [0, 1, 2, 3, 4, 5, 6, 7];

    function log(msg) {
        console.log('[eCMS Timecard Saver] ' + msg);
    }

    function saveTimecard() {
        const table = document.querySelector("#form1\\:subfile");
        if (!table) return alert("Timecard table not found.");

        const timecardData = [];
        const rows = table.querySelectorAll("tbody tr");

        rows.forEach(row => {
            const fields = row.querySelectorAll("td input:not([type='hidden']), td select");
            const rowData = [];
            FIELD_INDEXES_TO_COPY.forEach(i => {
                if (fields[i]) rowData.push(fields[i].value.trim());
            });
            if (rowData.length > 0) timecardData.push(rowData);
        });

        if (timecardData.length === 0) return alert("No data found to save.");

        localStorage.setItem(STORAGE_KEY, JSON.stringify(timecardData));
        alert("Selected fields saved successfully.");
        log("Saved selective data to localStorage.");

        const okBtn = document.querySelector("#form1\\:CFEN");
        if (okBtn) okBtn.click();
    }

    function parseSavedData(raw) {
        try {
            let parsed = JSON.parse(raw);
            if (typeof parsed === 'string') parsed = JSON.parse(parsed); // double-parsed case
            if (!Array.isArray(parsed)) throw new Error("Data is not an array");
            return parsed;
        } catch (e) {
            localStorage.removeItem(STORAGE_KEY);
            alert("Saved data was invalid. It has been cleared.");
            console.error("Parsing error:", e.message);
            return null;
        }
    }

    function pasteTimecard() {
        const table = document.querySelector("#form1\\:subfile");
        if (!table) return alert("Timecard table not found.");

        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return alert("No saved timecard found.");

        const parsedData = parseSavedData(raw);
        if (!parsedData) return;

        const rows = table.querySelectorAll("tbody tr");
        parsedData.forEach((savedRow, rowIndex) => {
            const row = rows[rowIndex];
            if (!row) return;
            const fields = row.querySelectorAll("td input:not([type='hidden']), td select");
            FIELD_INDEXES_TO_COPY.forEach((i, j) => {
                if (fields[i] && savedRow[j] !== undefined) {
                    fields[i].value = savedRow[j];
                }
            });
        });

        alert(`${parsedData.length} rows pasted successfully.`);
    }

    function addButtons() {
        if (document.getElementById("ecms-timecard-toolbar")) return;

        const container = document.createElement("div");
        container.id = "ecms-timecard-toolbar";
        container.style.position = "fixed";
        container.style.top = "10px";
        container.style.right = "10px";
        container.style.zIndex = "9999";
        container.style.background = "white";
        container.style.padding = "10px";
        container.style.border = "2px solid black";
        container.style.borderRadius = "5px";
        container.style.boxShadow = "2px 2px 10px rgba(0,0,0,0.3)";

        const saveBtn = document.createElement("button");
        saveBtn.innerText = "Save Timecard";
        saveBtn.style.cssText = "margin:5px; padding:6px; background:#4CAF50; color:white;";
        saveBtn.onclick = saveTimecard;

        const pasteBtn = document.createElement("button");
        pasteBtn.innerText = "Paste Timecard";
        pasteBtn.style.cssText = "margin:5px; padding:6px; background:#2196F3; color:white;";
        pasteBtn.onclick = pasteTimecard;

        container.appendChild(saveBtn);
        container.appendChild(pasteBtn);
        document.body.appendChild(container);
    }

    function waitForTable() {
        const interval = setInterval(() => {
            const table = document.querySelector("#form1\\:subfile");
            if (table) {
                addButtons();
                clearInterval(interval);
            }
        }, 500);
    }

    document.addEventListener("mousedown", (e) => {
        if (e.button === 3) {
            e.preventDefault();
            e.stopPropagation();
            pasteTimecard();
        } else if (e.button === 4) {
            e.preventDefault();
            e.stopPropagation();
            saveTimecard();
        }
    });

    window.addEventListener("load", waitForTable);
})();
