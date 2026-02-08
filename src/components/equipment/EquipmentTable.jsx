// src/components/equipment/EquipmentTable.js
import React from "react";
import "./Equipment_page.css";

const getEquipmentDisplayName = (equipment) => {
  return equipment?.name || equipment?.equipmentName || equipment?.title || "—";
};

export default function EquipmentTable({ equipments, laboratories, onEdit, onDelete }) {
  return (
    <div className="equipment-table-container">
      <div className="table-header">
        <h3>Equipment List ({equipments.length})</h3>
      </div>

      <div className="table-wrapper">
        <table className="equipment-table">
          <thead>
            <tr>
              <th>Equipment Names</th>
              <th>Model</th>
              <th>Serial Number</th>
              <th>Laboratory</th>
              <th>Status</th>
              <th className="center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {equipments.map((equipment) => {
              const laboratory = laboratories.find(lab => lab.labId === equipment.labId);
              return (
                <tr key={equipment.id}>
                  <td className="equipment-name-cell">{getEquipmentDisplayName(equipment)}</td>
                  <td className="equipment-model-cell">{equipment.model || "—"}</td>
                  <td>{equipment.serialNumber || "—"}</td>
                  <td>
                    {laboratory ? (
                      <span className="laboratory-info">
                        {laboratory.labName} ({laboratory.labId})
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span 
                      className="status-badge"
                      style={{ 
                        backgroundColor: equipment.status === 'Available' ? '#10b981' :
                                       equipment.status === 'In Use' ? '#f59e0b' :
                                       equipment.status === 'Maintenance' ? '#ef4444' : '#6b7280'
                      }}
                    >
                      {equipment.status || "—"}
                    </span>
                  </td>
                  <td className="center">
                    <div className="table-actions">
                      <button
                        onClick={() => onEdit(equipment)}
                        className="btn-edit"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(equipment.id)}
                        className="btn-delete"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}