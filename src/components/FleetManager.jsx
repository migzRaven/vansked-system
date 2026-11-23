import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import toast from "react-hot-toast";
import { db } from "../firebase";
import "./FleetManager.css";

const INITIAL_VAN = {
  driver: "",
  plateNumber: "",
  vanType: "",
  phone: "",
  capacity: "",
};

const normalizePlateNumber = (plateNumber) =>
  plateNumber.trim().toUpperCase().replace(/\s+/g, "");

const validateVan = (van) => {
  if (
    !van.driver.trim() ||
    !van.plateNumber.trim() ||
    !van.vanType.trim() ||
    !van.phone.trim()
  ) {
    return "Please complete all required fields.";
  }

  const capacity = Number(van.capacity);

  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    return "Capacity must be a whole number between 1 and 100.";
  }

  return null;
};

function FleetManager() {
  const [fleet, setFleet] = useState([]);
  const [newVan, setNewVan] = useState(INITIAL_VAN);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    const fleetQuery = collection(db, "fleet");

    const unsubscribe = onSnapshot(
      fleetQuery,
      (snapshot) => {
        setFleet(
          snapshot.docs.map((document) => ({
            id: document.id,
            ...document.data(),
          }))
        );
        setLoading(false);
      },
      (error) => {
        console.error("Fleet subscription error:", error);
        toast.error("Unable to load fleet records.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const resetForm = () => {
    setNewVan(INITIAL_VAN);
    setEditingId(null);
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setNewVan((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const checkDuplicatePlate = async (plateNumber, excludedId = null) => {
    const fleetSnapshot = await getDocs(collection(db, "fleet"));
    const normalizedPlate = normalizePlateNumber(plateNumber);

    return fleetSnapshot.docs.some((document) => {
      if (document.id === excludedId) {
        return false;
      }

      const existing = document.data();
      const existingPlate = normalizePlateNumber(
        existing.plateNumberNormalized || existing.plateNumber || ""
      );

      return existingPlate === normalizedPlate;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validateVan(newVan);

    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);

    try {
      const normalizedPlate = normalizePlateNumber(newVan.plateNumber);

      const duplicate = await checkDuplicatePlate(
        newVan.plateNumber,
        editingId
      );

      if (duplicate) {
        toast.error("A vehicle with this plate number already exists.");
        return;
      }

      const vehicleData = {
        driver: newVan.driver.trim(),
        plateNumber: newVan.plateNumber.trim().toUpperCase(),
        plateNumberNormalized: normalizedPlate,
        vanType: newVan.vanType.trim(),
        phone: newVan.phone.trim(),
        capacity: Number(newVan.capacity),
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        const vehicleRef = doc(db, "fleet", editingId);
        await updateDoc(vehicleRef, vehicleData);
        toast.success("Vehicle updated successfully.");
      } else {
        await addDoc(collection(db, "fleet"), {
          ...vehicleData,
          active: true,
          createdAt: serverTimestamp(),
        });
        toast.success("Vehicle registered successfully.");
      }

      resetForm();
    } catch (error) {
      console.error("Fleet save error:", error);
      toast.error(error.message || "Unable to save vehicle.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (van) => {
    setEditingId(van.id);
    setNewVan({
      driver: van.driver || "",
      plateNumber: van.plateNumber || "",
      vanType: van.vanType || "",
      phone: van.phone || "",
      capacity: String(van.capacity ?? ""),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (van) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete vehicle ${van.plateNumber}?`
    );

    if (!confirmed) return;

    setDeletingId(van.id);

    try {
      const assignedTripsQuery = query(
        collection(db, "trips"),
        where("plateNumber", "==", van.plateNumber)
      );

      const assignedTripsSnapshot = await getDocs(assignedTripsQuery);

      const hasActiveTrips = assignedTripsSnapshot.docs.some((tripDoc) => {
        const trip = tripDoc.data();
        return trip.status !== "Departed";
      });

      if (hasActiveTrips) {
        toast.error(
          "This vehicle cannot be deleted because it has active trips."
        );
        return;
      }

      const vehicleRef = doc(db, "fleet", van.id);

      await runTransaction(db, async (transaction) => {
        const vehicleSnapshot = await transaction.get(vehicleRef);
        if (!vehicleSnapshot.exists()) {
          throw new Error("This vehicle no longer exists.");
        }
        transaction.delete(vehicleRef);
      });

      if (editingId === van.id) {
        resetForm();
      }

      toast.success("Vehicle deleted successfully.");
    } catch (error) {
      console.error("Fleet deletion error:", error);
      toast.error(error.message || "Unable to delete vehicle.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Fleet Management</h1>
        <p>Register and manage terminal vehicles</p>
      </header>

      <div className="form-container">
        <h3>{editingId ? "Edit Vehicle" : "Register New Vehicle"}</h3>

        <form onSubmit={handleSubmit} className="form-group">
          <label className="form-label">Driver Name</label>
          <input
            type="text"
            name="driver"
            className="input-field"
            value={newVan.driver}
            onChange={handleInputChange}
            placeholder="e.g. Juan Dela Cruz"
            required
          />

          <label className="form-label">Plate Number</label>
          <input
            type="text"
            name="plateNumber"
            className="input-field"
            value={newVan.plateNumber}
            onChange={handleInputChange}
            placeholder="e.g. ABC 123"
            required
          />

          <label className="form-label">Vehicle Type</label>
          <input
            type="text"
            name="vanType"
            className="input-field"
            value={newVan.vanType}
            onChange={handleInputChange}
            placeholder="e.g. Passenger Van"
            required
          />

          <label className="form-label">Contact Number</label>
          <input
            type="tel"
            name="phone"
            className="input-field"
            value={newVan.phone}
            onChange={handleInputChange}
            placeholder="e.g. 09123456789"
            required
          />

          <label className="form-label">Passenger Capacity</label>
          <input
            type="number"
            name="capacity"
            className="input-field"
            value={newVan.capacity}
            onChange={handleInputChange}
            placeholder="e.g. 14"
            min="1"
            max="100"
            step="1"
            required
          />

          <div className="form-actions">
            <button type="submit" className="btn btn-success" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update Vehicle" : "Register Vehicle"}
            </button>
            {editingId && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={resetForm}
                disabled={saving}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="fleet-container">
        <h3>Registered Fleet ({fleet.length})</h3>

        {loading ? (
          <p>Loading fleet records...</p>
        ) : fleet.length === 0 ? (
          <p className="empty-board">No vehicles registered yet.</p>
        ) : (
          <div className="fleet-list">
            {fleet.map((van) => (
              <div className="fleet-card" key={van.id}>
                
                <div className="fleet-card-header">
                  <h4>{van.plateNumber}</h4>
                  <span className={`status-badge ${van.active === false ? 'inactive' : 'active'}`}>
                    {van.active === false ? "Inactive" : "Active"}
                  </span>
                </div>

                <div className="fleet-card-body">
                  <div className="fleet-info">
                    <span className="info-label">Driver</span>
                    <span className="info-value">{van.driver}</span>
                  </div>
                  <div className="fleet-info">
                    <span className="info-label">Type</span>
                    <span className="info-value">{van.vanType}</span>
                  </div>
                  <div className="fleet-info">
                    <span className="info-label">Contact</span>
                    <span className="info-value">{van.phone}</span>
                  </div>
                  <div className="fleet-info">
                    <span className="info-label">Capacity</span>
                    <span className="info-value">{van.capacity} seats</span>
                  </div>
                </div>

                <div className="fleet-card-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleEdit(van)}
                    disabled={Boolean(deletingId) || saving}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => handleDelete(van)}
                    disabled={Boolean(deletingId) || saving}
                  >
                    {deletingId === van.id ? "Deleting..." : "Delete"}
                  </button>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default FleetManager;