// src/components/ToastNotification.jsx
import React, { useEffect, useState } from "react";

export default function ToastNotification({ 
  message, 
  type = "success", 
  duration = 3000, 
  onClose 
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    setIsVisible(true);

    // Auto-close after duration
    const timer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      if (onClose) onClose();
    }, 300); // Match the exit animation duration
  };

  if (!isVisible) return null;

  const getToastStyles = () => {
    const baseStyles = {
      position: "fixed",
      bottom: "20px",
      left: "50%",
      transform: `translateX(-50%) ${isExiting ? "translateY(100px)" : "translateY(0)"}`,
      minWidth: "320px",
      maxWidth: "500px",
      padding: "16px 20px",
      borderRadius: "12px",
      boxShadow: "0 10px 40px rgba(0, 0, 0, 0.15), 0 2px 10px rgba(0, 0, 0, 0.1)",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      zIndex: 9999,
      opacity: isExiting ? 0 : 1,
      transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
      fontSize: "14px",
      fontWeight: "500",
      backdropFilter: "blur(10px)",
      border: "1px solid rgba(255, 255, 255, 0.2)"
    };

    const typeStyles = {
      success: {
        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
        color: "#fff",
        boxShadow: "0 10px 40px rgba(16, 185, 129, 0.25), 0 2px 10px rgba(0, 0, 0, 0.1)"
      },
      error: {
        background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
        color: "#fff",
        boxShadow: "0 10px 40px rgba(239, 68, 68, 0.25), 0 2px 10px rgba(0, 0, 0, 0.1)"
      },
      warning: {
        background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
        color: "#fff",
        boxShadow: "0 10px 40px rgba(245, 158, 11, 0.25), 0 2px 10px rgba(0, 0, 0, 0.1)"
      },
      info: {
        background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
        color: "#fff",
        boxShadow: "0 10px 40px rgba(59, 130, 246, 0.25), 0 2px 10px rgba(0, 0, 0, 0.1)"
      }
    };

    return { ...baseStyles, ...typeStyles[type] };
  };

  const getIcon = () => {
    const icons = {
      success: "✓",
      error: "✕",
      warning: "⚠",
      info: "ℹ"
    };
    return icons[type];
  };

  return (
    <div style={getToastStyles()}>
      <div 
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "50%",
          backgroundColor: "rgba(255, 255, 255, 0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "16px",
          fontWeight: "bold",
          flexShrink: 0
        }}
      >
        {getIcon()}
      </div>
      <div style={{ 
        flex: 1,
        lineHeight: "1.4",
        letterSpacing: "0.025em"
      }}>
        {message}
      </div>
      <button
        onClick={handleClose}
        style={{
          background: "rgba(255, 255, 255, 0.15)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          color: "rgba(255, 255, 255, 0.9)",
          fontSize: "20px",
          cursor: "pointer",
          padding: "0",
          width: "28px",
          height: "28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "6px",
          transition: "all 0.2s ease",
          flexShrink: 0,
          fontWeight: "300"
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = "rgba(255, 255, 255, 0.25)";
          e.target.style.transform = "scale(1.05)";
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = "rgba(255, 255, 255, 0.15)";
          e.target.style.transform = "scale(1)";
        }}
      >
        ×
      </button>
    </div>
  );
}
