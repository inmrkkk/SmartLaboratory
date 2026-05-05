import React, { useEffect, useMemo, useState } from "react";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import "../CSS/AdminLabEquipment.css";

export default function AdminLabEquipment() {
  const { isAdmin } = useAuth();
  const [laboratories, setLaboratories] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [selectedLab, setSelectedLab] = useState("all");
  const [loading, setLoading] = useState(true);

  const selectedLabLabel = useMemo(() => {
    if (selectedLab === "all") return "All Laboratories";
    const lab = laboratories.find((item) => item.id === selectedLab);
    return lab?.labName || lab?.name || lab?.labId || "Selected Laboratory";
  }, [selectedLab, laboratories]);

  useEffect(() => {
    if (!isAdmin()) return;

    const labsRef = ref(database, "laboratories");
    const unsubscribe = onValue(labsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setLaboratories([]);
        return;
      }
      const list = Object.keys(data).map((key) => ({
        id: key,
        ...data[key]
      }));
      list.sort((a, b) => (a.labName || "").localeCompare(b.labName || ""));
      setLaboratories(list);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin()) return;

    setLoading(true);
    const categoriesRef = ref(database, "equipment_categories");

    const unsubscribe = onValue(categoriesRef, (snapshot) => {
      const categoriesData = snapshot.val();
      if (!categoriesData) {
        setEquipment([]);
        setLoading(false);
        return;
      }

      const allEquipment = [];

      Object.keys(categoriesData).forEach((categoryId) => {
        const category = categoriesData[categoryId] || {};
        const equipments = category.equipments || {};

        Object.keys(equipments).forEach((equipmentId) => {
          allEquipment.push({
            id: equipmentId,
            categoryId,
            categoryName: category.title || "—",
            ...equipments[equipmentId]
          });
        });
      });

      setEquipment(allEquipment);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  const laboratoryOptions = useMemo(() => {
    return laboratories.map((lab) => ({
      value: lab.id,
      label: lab.labName || lab.name || lab.labId || lab.id
    }));
  }, [laboratories]);

  const resolveLabLabel = useMemo(() => {
    const byId = new Map(laboratories.map((lab) => [lab.id, lab]));
    const byLabId = new Map(laboratories.map((lab) => [lab.labId, lab]));

    return (item) => {
      const candidates = [item.labRecordId, item.labId, item.laboratoryId, item.assignedLabId].filter(Boolean);
      for (const candidate of candidates) {
        if (byId.has(candidate)) {
          const lab = byId.get(candidate);
          return lab?.labName || lab?.name || lab?.labId || lab?.id;
        }
        if (byLabId.has(candidate)) {
          const lab = byLabId.get(candidate);
          return lab?.labName || lab?.name || lab?.labId || lab?.id;
        }
      }
      if (item.laboratory) return item.laboratory;
      return "—";
    };
  }, [laboratories]);

  const isInSelectedLab = useMemo(() => {
    if (selectedLab === "all") return () => true;

    const selectedLabRecord = laboratories.find((lab) => lab.id === selectedLab);
    const selectedLabIdValue = selectedLabRecord?.labId;

    return (item) => {
      if (!item) return false;
      if (item.labRecordId && item.labRecordId === selectedLab) return true;
      if (item.assignedLabId && item.assignedLabId === selectedLab) return true;
      if (item.labId && selectedLabIdValue && item.labId === selectedLabIdValue) return true;
      if (item.laboratoryId && item.laboratoryId === selectedLab) return true;
      return false;
    };
  }, [selectedLab, laboratories]);

  const filteredEquipment = useMemo(() => {
    return equipment
      .filter(isInSelectedLab)
      .sort((a, b) => {
        const aName = (a.name || a.equipmentName || a.title || "").toString();
        const bName = (b.name || b.equipmentName || b.title || "").toString();
        return aName.localeCompare(bName);
      });
  }, [equipment, isInSelectedLab]);

  const getDisplayName = (item) => {
    return item?.name || item?.equipmentName || item?.title || item?.itemName || "—";
  };

  const getStatus = (item) => {
    return item?.status || item?.condition || "—";
  };

  const buildExportRows = useMemo(() => {
    return filteredEquipment.map((item) => ({
      equipmentName: getDisplayName(item),
      model: item.model || "—",
      category: item.categoryName || "—",
      laboratory: resolveLabLabel(item),
      serialNumber: item.serialNumber || "—",
      quantity: item.quantity || "1",
      status: getStatus(item)
    }));
  }, [filteredEquipment, resolveLabLabel]);

  const downloadCsv = () => {
    const headers = ["Equipment Name", "Model", "Category", "Laboratory", "Serial Number", "Quantity", "Status"];
    const escapeCsv = (value) => {
      const text = (value ?? "").toString();
      if (/[^\S\r\n]*[\n\r",]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const lines = [
      headers.join(","),
      ...buildExportRows.map((row) =>
        [
          row.equipmentName,
          row.model,
          row.category,
          row.laboratory,
          row.serialNumber,
          row.quantity,
          row.status
        ]
          .map(escapeCsv)
          .join(",")
      )
    ];

    const csvContent = `\uFEFF${lines.join("\n")}`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const fileName = `All_Laboratory_Equipment_${selectedLabLabel.replace(/\s+/g, "_")}_${new Date()
      .toISOString()
      .split("T")[0]}.csv`;

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportPdf = async () => {
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 14;

      // Helper to load image and get its data/dimensions using Canvas
      const getImageData = async (url) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              const base64 = canvas.toDataURL('image/png');
              resolve({ base64, width: img.width, height: img.height });
            } catch (err) {
              console.error("Canvas conversion error:", err);
              resolve(null);
            }
          };
          img.onerror = (err) => {
            console.error(`Image load error for ${url}:`, err);
            resolve(null);
          };
          img.src = url;
        });
      };

      // Load header and footer data
      const headerData = await getImageData(`${window.location.origin}/header.png`);
      const footerData = await getImageData(`${window.location.origin}/footer.png`);

      // Calculate heights based on 1121x793 aspect ratio
      const imageAspectRatio = 793 / 1121;
      let headerHeight = headerData && headerData.width > 0 
        ? (headerData.height / headerData.width) * pageWidth 
        : imageAspectRatio * pageWidth;
      let footerHeight = footerData && footerData.width > 0 
        ? (footerData.height / footerData.width) * pageWidth 
        : imageAspectRatio * pageWidth;

      // Safety scaling for branding
      const maxBrandingHeight = pageHeight * 0.45;
      if ((headerHeight + footerHeight) > maxBrandingHeight) {
        const scale = maxBrandingHeight / (headerHeight + footerHeight);
        headerHeight *= scale;
        footerHeight *= scale;
      }

      // Function to add header, footer, and page numbers
      const addPageDecorations = (data) => {
        if (headerData) {
          doc.addImage(headerData.base64, 'PNG', -0.5, 0, pageWidth + 1, headerHeight);
        }
        if (footerData) {
          doc.addImage(footerData.base64, 'PNG', -0.5, pageHeight - footerHeight, pageWidth + 1, footerHeight);
        }

        const pageNumber = data.pageNumber;
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${pageNumber}`, pageWidth - margin, pageHeight - footerHeight - 5, { align: 'right' });
      };

      const head = [["#", "Equipment Name", "Model", "Category", "Laboratory", "Serial Number", "Qty", "Status"]];
      const body = buildExportRows.map((row, idx) => [
        idx + 1,
        row.equipmentName,
        row.model,
        row.category,
        row.laboratory,
        row.serialNumber,
        row.quantity,
        row.status
      ]);

      autoTable(doc, {
        head,
        body,
        startY: headerHeight,
        margin: { top: headerHeight, bottom: footerHeight, left: margin, right: margin },
        didDrawPage: addPageDecorations,
        theme: 'grid',
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: 255,
          fontSize: 9,
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
          lineWidth: 0.1,
          lineColor: [255, 255, 255]
        },
        bodyStyles: {
          fontSize: 8,
          valign: 'middle',
          textColor: [50, 50, 50],
          lineWidth: 0.1,
          lineColor: [200, 200, 200]
        },
        columnStyles: {
          0: { cellWidth: 15, halign: 'center' },
          1: { cellWidth: 50 },
          2: { cellWidth: 35 },
          3: { cellWidth: 35 },
          4: { cellWidth: 'auto' },
          5: { cellWidth: 35 },
          6: { cellWidth: 15, halign: 'center' },
          7: { cellWidth: 30, halign: 'center' }
        },
        styles: { overflow: 'linebreak', cellPadding: 3 },
        rowPageBreak: 'auto',
      });

      const fileName = `All_Laboratory_Equipment_${selectedLabLabel.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error("PDF Export error:", error);
      alert(`Failed to generate PDF report: ${error.message}`);
    }
  };

  if (!isAdmin()) {
    return (
      <div className="admin-lab-equipment">
        <div className="admin-lab-equipment__header">
          <h1 className="admin-lab-equipment__title">All Laboratory Equipment</h1>
          <p className="admin-lab-equipment__subtitle">Access restricted to Admin users.</p>
        </div>

        <div className="admin-lab-equipment__card">
          <div className="admin-lab-equipment__empty">Access Denied</div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-lab-equipment">
      <div className="admin-lab-equipment__header">
        <div>
          <h1 className="admin-lab-equipment__title">All Laboratory Equipment</h1>
          <p className="admin-lab-equipment__subtitle">View and manage equipment across all laboratories.</p>
        </div>

        <div className="admin-lab-equipment__filters">
          <label className="admin-lab-equipment__filter-label" htmlFor="labFilter">
            Laboratory
          </label>
          <select
            id="labFilter"
            className="admin-lab-equipment__select"
            value={selectedLab}
            onChange={(e) => setSelectedLab(e.target.value)}
          >
            <option value="all">All Laboratories</option>
            {laboratoryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="admin-lab-equipment__card">
        <div className="admin-lab-equipment__card-header">
          <h3 className="admin-lab-equipment__card-title">
            Equipment List ({loading ? "…" : filteredEquipment.length})
          </h3>

          <div className="admin-lab-equipment__actions">
            <button
              type="button"
              className="admin-lab-equipment__action-btn"
              onClick={downloadCsv}
              disabled={loading || filteredEquipment.length === 0}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="admin-lab-equipment__action-btn admin-lab-equipment__action-btn--primary"
              onClick={exportPdf}
              disabled={loading || filteredEquipment.length === 0}
            >
              Export PDF
            </button>
          </div>
        </div>

        {loading ? (
          <div className="admin-lab-equipment__empty">Loading equipment…</div>
        ) : filteredEquipment.length === 0 ? (
          <div className="admin-lab-equipment__empty">No equipment found.</div>
        ) : (
          <div className="admin-lab-equipment__table-wrapper">
            <table className="admin-lab-equipment__table">
              <thead>
                <tr>
                  <th>Equipment Name</th>
                  <th>Model</th>
                  <th>Category</th>
                  <th>Laboratory</th>
                  <th>Serial Number</th>
                  <th>Quantity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredEquipment.map((item) => (
                  <tr key={`${item.categoryId}_${item.id}`}>
                    <td className="admin-lab-equipment__name">{getDisplayName(item)}</td>
                    <td>{item.model || "—"}</td>
                    <td>{item.categoryName || "—"}</td>
                    <td>{resolveLabLabel(item)}</td>
                    <td>{item.serialNumber || "—"}</td>
                    <td>{item.quantity || "1"}</td>
                    <td>
                      <span className="admin-lab-equipment__status">{getStatus(item)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
