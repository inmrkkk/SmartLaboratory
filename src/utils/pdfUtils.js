import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Export activities to PDF
 * @param {Array} activities - Array of activity objects
 * @param {string} title - PDF title
 * @param {Function} formatFunction - Function to format activity data for table
 */
export const exportToPDF = (activities, title = 'Activities Report', formatFunction) => {
  const doc = new jsPDF();

  // Add title
  doc.setFontSize(18);
  doc.text(title, 14, 20);

  // Add date
  doc.setFontSize(10);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

  // Format data for table
  const tableData = formatFunction ? formatFunction(activities) : activities.map((activity, index) => [
    index + 1,
    activity.title || activity.action || 'N/A',
    activity.equipmentName || activity.itemName || 'N/A',
    activity.borrower || activity.adviserName || 'N/A',
    activity.status || 'N/A',
    activity.time || activity.timestamp || activity.releasedDate ?
      new Date(activity.time || activity.timestamp || activity.releasedDate).toLocaleDateString() : 'N/A'
  ]);

  // Determine column headers based on data
  let headers = ['#', 'Activity/Action', 'Item/Equipment', 'Borrower', 'Status', 'Date'];
  if (Array.isArray(tableData[0]) && tableData[0].length > 6) {
    // Extended format with more columns
    if (tableData[0].length === 9) {
      headers = ['#', 'Action', 'Equipment', 'Borrower', 'Instructor', 'Status', 'Released Date', 'Return Date', 'Condition'];
    } else if (tableData[0].length === 8) {
      // Check if it's history format or request format based on column names
      const firstRow = tableData[0];
      // History format: Action, Equipment, Borrower, Instructor, Status, Released Date, Return Date, Condition (9 cols)
      // Request format: Item Name, Borrower, Instructor, Laboratory, Category, Quantity, Status, Date (9 cols)
      // Both are 9 columns, so we check the content
      // Position 6 in request format is quantity (number), in history format it's released date (string with date)
      if (firstRow[5] && (firstRow[5].toLowerCase().includes('category') || firstRow[5] === 'N/A' || !isNaN(parseInt(firstRow[5])))) {
        // Request format (has category or quantity as number)
        headers = ['#', 'Item Name', 'Borrower', 'Instructor', 'Laboratory', 'Category', 'Quantity', 'Status'];
      } else {
        // History format
        headers = ['#', 'Action', 'Equipment', 'Borrower', 'Instructor', 'Status', 'Released Date', 'Return Date'];
      }
    }
  }

  // Auto table
  autoTable(doc, {
    startY: 35,
    head: [headers],
    body: Array.isArray(tableData[0]) && typeof tableData[0][0] === 'number'
      ? tableData
      : tableData.map((row, idx) => {
        if (typeof row === 'object' && !Array.isArray(row)) {
          // Object format - build array based on available fields
          const result = [idx + 1];
          if (row.action) result.push(row.action);
          else if (row.title) result.push(row.title);
          else result.push('N/A');

          if (row.equipmentName) result.push(row.equipmentName);
          else if (row.item) result.push(row.item);
          else result.push('N/A');

          if (row.borrower) result.push(row.borrower);
          else result.push('N/A');

          if (row.adviserName) result.push(row.adviserName);
          else if (row.instructorName) result.push(row.instructorName);
          else result.push('N/A');

          result.push(row.status || 'N/A');

          if (row.releasedDate) result.push(row.releasedDate);
          else if (row.time) result.push(row.time);
          else if (row.date) result.push(row.date);
          else result.push('N/A');

          if (row.returnDate) result.push(row.returnDate);
          if (row.condition) result.push(row.condition);

          return result;
        }
        return [
          idx + 1,
          row.title || row.action || 'N/A',
          row.item || row.equipmentName || 'N/A',
          row.borrower || row.adviserName || 'N/A',
          row.status || 'N/A',
          row.time || row.date || 'N/A'
        ];
      }),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [66, 139, 202] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { top: 35 },
    theme: 'striped'
  });

  // Save PDF
  const fileName = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
};

/**
 * Print activities
 * @param {Array} activities - Array of activity objects
 * @param {string} title - Print title
 * @param {Function} formatFunction - Function to format activity data
 */
export const printActivities = (activities, title = 'Activities Report', formatFunction) => {
  // Create a print window
  const printWindow = window.open('', '_blank');

  // Build HTML content
  let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 20px;
          color: #333;
        }
        h1 {
          color: #4285F4;
          border-bottom: 2px solid #4285F4;
          padding-bottom: 10px;
        }
        .info {
          color: #666;
          margin-bottom: 20px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 12px;
          text-align: left;
        }
        th {
          background-color: #4285F4;
          color: white;
          font-weight: bold;
        }
        tr:nth-child(even) {
          background-color: #f2f2f2;
        }
        tr:hover {
          background-color: #f5f5f5;
        }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <div class="info">Generated on: ${new Date().toLocaleString()}</div>
      <table>
        <thead>
          <tr id="dynamic-headers">
            <th>#</th>
            <th>Activity/Action</th>
            <th>Item/Equipment</th>
            <th>Borrower/Instructor</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
  `;

  // Add table rows
  let tableRows = '';
  let headersUpdated = false;

  if (formatFunction) {
    const formattedData = formatFunction(activities);

    // Update headers if we have extended format
    if (Array.isArray(formattedData[0]) && formattedData[0].length > 6) {
      if (formattedData[0].length === 9) {
        // Check if it's history format or request format
        const firstRow = formattedData[0];
        if (firstRow[2] && typeof firstRow[2] === 'string' && (firstRow[2].toLowerCase().includes('lab') || !isNaN(firstRow[6]))) {
          // Request format
          htmlContent = htmlContent.replace(
            '<tr id="dynamic-headers">',
            '<tr><th>#</th><th>Item Name</th><th>Borrower</th><th>Instructor</th><th>Laboratory</th><th>Category</th><th>Quantity</th><th>Status</th><th>Date</th></tr>'
          );
        } else {
          // History format
          htmlContent = htmlContent.replace(
            '<tr id="dynamic-headers">',
            '<tr><th>#</th><th>Action</th><th>Equipment</th><th>Borrower</th><th>Instructor</th><th>Status</th><th>Released Date</th><th>Return Date</th><th>Condition</th></tr>'
          );
        }
        headersUpdated = true;
      } else if (formattedData[0].length === 8) {
        // Check if it's history format or request format
        const firstRow = formattedData[0];
        // Position 5 in request format is category (string), in history format it's status
        if (firstRow[5] && (firstRow[5].toLowerCase().includes('category') || firstRow[5] === 'N/A' || !isNaN(parseInt(firstRow[5])))) {
          // Request format
          htmlContent = htmlContent.replace(
            '<tr id="dynamic-headers">',
            '<tr><th>#</th><th>Item Name</th><th>Borrower</th><th>Instructor</th><th>Laboratory</th><th>Category</th><th>Quantity</th><th>Status</th></tr>'
          );
        } else {
          // History format
          htmlContent = htmlContent.replace(
            '<tr id="dynamic-headers">',
            '<tr><th>#</th><th>Action</th><th>Equipment</th><th>Borrower</th><th>Instructor</th><th>Status</th><th>Released Date</th><th>Return Date</th></tr>'
          );
        }
        headersUpdated = true;
      }
    }

    if (!headersUpdated) {
      htmlContent = htmlContent.replace('id="dynamic-headers"', '');
    }

    formattedData.forEach((row, index) => {
      if (typeof row === 'object' && !Array.isArray(row)) {
        // Handle object format
        let rowHtml = `<tr><td>${index + 1}</td>`;
        // Check if it's request format (has itemName and laboratory) or activity/history format
        if (row.itemName && (row.laboratory || row.categoryName)) {
          // Request format
          rowHtml += `<td>${row.itemName || 'N/A'}</td>`;
          rowHtml += `<td>${row.borrower || 'N/A'}</td>`;
          rowHtml += `<td>${row.adviserName || 'N/A'}</td>`;
          if (row.laboratory) rowHtml += `<td>${row.laboratory}</td>`;
          if (row.categoryName) rowHtml += `<td>${row.categoryName}</td>`;
          if (row.quantity) rowHtml += `<td>${row.quantity}</td>`;
          rowHtml += `<td>${row.status || 'N/A'}</td>`;
          rowHtml += `<td>${row.requestedAt || row.time || row.date || 'N/A'}</td>`;
        } else {
          // Activity/History format
          rowHtml += `<td>${row.title || row.action || 'N/A'}</td>`;
          rowHtml += `<td>${row.item || row.equipmentName || 'N/A'}</td>`;
          rowHtml += `<td>${row.borrower || 'N/A'}</td>`;
          if (row.adviserName) rowHtml += `<td>${row.adviserName}</td>`;
          rowHtml += `<td>${row.status || 'N/A'}</td>`;
          rowHtml += `<td>${row.releasedDate || row.time || row.date || 'N/A'}</td>`;
          if (row.returnDate) rowHtml += `<td>${row.returnDate}</td>`;
          if (row.condition) rowHtml += `<td>${row.condition}</td>`;
        }
        rowHtml += '</tr>';
        tableRows += rowHtml;
      } else if (Array.isArray(row)) {
        // Handle array format
        tableRows += `<tr><td>${row.join('</td><td>')}</td></tr>`;
      }
    });
  } else {
    htmlContent = htmlContent.replace('id="dynamic-headers"', '');
    activities.forEach((activity, index) => {
      tableRows += `
        <tr>
          <td>${index + 1}</td>
          <td>${activity.title || activity.action || 'N/A'}</td>
          <td>${activity.equipmentName || activity.itemName || 'N/A'}</td>
          <td>${activity.borrower || activity.adviserName || 'N/A'}</td>
          <td>${activity.status || 'N/A'}</td>
          <td>${activity.time || activity.timestamp || activity.releasedDate ?
          new Date(activity.time || activity.timestamp || activity.releasedDate).toLocaleString() : 'N/A'}</td>
        </tr>
      `;
    });
  }

  htmlContent += tableRows;

  htmlContent += `
        </tbody>
      </table>
    </body>
    </html>
  `;

  // Write content and print
  printWindow.document.write(htmlContent);
  printWindow.document.close();

  // Wait for content to load then print
  setTimeout(() => {
    printWindow.print();
  }, 250);
};

