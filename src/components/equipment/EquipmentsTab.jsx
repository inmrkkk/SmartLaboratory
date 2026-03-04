// src/components/equipment/EquipmentsTab.js
import React, { useState } from "react";
import { ref, push, update, remove } from "firebase/database";
import { database } from "../../firebase";
import EquipmentModal from "./EquipmentModal";
import EquipmentTable from "./EquipmentTable";
import "./Equipment_page.css";

export default function EquipmentsTab({ 
  categories, 
  equipments, 
  selectedCategory, 
  onCategoryChange, 
  onEquipmentsUpdate 
}) {
  const [showAddEquipmentForm, setShowAddEquipmentForm] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState(null);

  const updateCategoryCounts = async (categoryId) => {
    try {
      const equipmentsRef = ref(database, `equipment_categories/${categoryId}/equipments`);
      const { onValue } = await import("firebase/database");
      
      onValue(equipmentsRef, async (snapshot) => {
        const data = snapshot.val();
        const totalCount = data ? Object.keys(data).length : 0;
        
        // Calculate available count based on quantity_borrowed, not status
        const availableCount = data 
          ? Object.values(data).reduce((sum, eq) => {
              const totalQuantity = Number(eq.quantity) || 1;
              const borrowedQuantity = Number(eq.quantity_borrowed) || 0;
              const availableQuantity = Math.max(0, totalQuantity - borrowedQuantity);
              return sum + availableQuantity;
            }, 0)
          : 0;
        
        const categoryRef = ref(database, `equipment_categories/${categoryId}`);
        await update(categoryRef, {
          totalCount,
          availableCount
        });
      }, { onlyOnce: true });
    } catch (error) {
      console.error("Error updating category counts:", error);
    }
  };

  const handleEquipmentSubmit = async (equipmentData) => {
    if (!selectedCategory) {
      alert("Please select a category first");
      return;
    }

    try {
      const dataWithCategory = {
        ...equipmentData,
        categoryId: selectedCategory
      };

      if (editingEquipment) {
        // Update existing equipment
        const equipmentRef = ref(database, `equipment_categories/${selectedCategory}/equipments/${editingEquipment.id}`);
        await update(equipmentRef, {
          ...dataWithCategory,
          updatedAt: new Date().toISOString()
        });
        alert("Equipment updated successfully!");
      } else {
        // Add new equipment
        const equipmentsRef = ref(database, `equipment_categories/${selectedCategory}/equipments`);
        await push(equipmentsRef, {
          ...dataWithCategory,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        alert("Equipment added successfully!");
      }
      
      await updateCategoryCounts(selectedCategory);
      setShowAddEquipmentForm(false);
      setEditingEquipment(null);
      onEquipmentsUpdate();
    } catch (error) {
      console.error("Error saving equipment:", error);
      alert("Error saving equipment. Please try again.");
    }
  };

  const handleEditEquipment = (equipment) => {
    setEditingEquipment(equipment);
    setShowAddEquipmentForm(true);
  };

  const handleDeleteEquipment = async (equipmentId) => {
    if (window.confirm("Are you sure you want to delete this equipment?")) {
      try {
        const equipmentRef = ref(database, `equipment_categories/${selectedCategory}/equipments/${equipmentId}`);
        await remove(equipmentRef);
        await updateCategoryCounts(selectedCategory);
        alert("Equipment deleted successfully!");
        onEquipmentsUpdate();
      } catch (error) {
        console.error("Error deleting equipment:", error);
        alert("Error deleting equipment. Please try again.");
      }
    }
  };

  const closeModal = () => {
    setShowAddEquipmentForm(false);
    setEditingEquipment(null);
  };

  return (
    <div className="equipment-tab">
      <div className="equipment-header">
        <div>
          <h2>Individual Equipment</h2>
          <div className="category-selector">
            <label>Category:</label>
            <select
              value={selectedCategory}
              onChange={(e) => onCategoryChange(e.target.value)}
              className="category-select"
            >
              <option value="">Select Category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={() => {
            if (!selectedCategory) {
              alert("Please select a category first");
              return;
            }
            setShowAddEquipmentForm(true);
          }}
          className={`add-equipment-btn ${selectedCategory ? 'enabled' : 'disabled'}`}
        >
          + Add Equipment
        </button>
      </div>

      {/* Equipment Content */}
      {!selectedCategory ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔬</div>
          <h3>Select a Category</h3>
          <p>Choose a category from the dropdown above to view and manage equipment.</p>
        </div>
      ) : equipments.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h3>No equipment found</h3>
          <p>Add your first equipment to this category.</p>
        </div>
      ) : (
        <EquipmentTable 
          equipments={equipments}
          onEdit={handleEditEquipment}
          onDelete={handleDeleteEquipment}
        />
      )}

      {/* Equipment Modal */}
      {showAddEquipmentForm && (
        <EquipmentModal
          equipment={editingEquipment}
          onSubmit={handleEquipmentSubmit}
          onClose={closeModal}
        />
      )}
    </div>
  );
}