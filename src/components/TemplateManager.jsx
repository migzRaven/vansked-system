
import { useState, useEffect } from "react";

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
  getDocs,
  writeBatch,
} from "firebase/firestore";

import toast from "react-hot-toast";

import { db } from "../firebase";

import "./TemplateManager.css";

// --------------------------------------------------
// CONSTANTS
// --------------------------------------------------

const DESTINATIONS = [
  "Tacloban",
  "Sogod",
  "Bato",
];

const WEEKDAYS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

const DELETE_BATCH_SIZE = 450;

// --------------------------------------------------
// DEFAULT DATA BUILDERS
// --------------------------------------------------

const createEmptyScheduleGroup = () => ({
  name: "",
  days: {
    Mon: true,
    Tue: true,
    Wed: true,
    Thu: true,
    Fri: true,
    Sat: true,
    Sun: false,
  },
});

const createEmptyTrip = (fare = "") => ({
  time24: "",
  destination: "Tacloban",
  driver: "",
  plateNumber: "",
  phone: "",
  fare: String(fare ?? ""),
});

// --------------------------------------------------
// TIME UTILITIES
// --------------------------------------------------

const isValidTime24 = (time24) => {
  return (
    typeof time24 === "string" &&
    /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/.test(
      time24
    )
  );
};

const formatTimeDisplay = (time24) => {
  if (!isValidTime24(time24)) {
    return "";
  }

  const [hours, minutes] = time24.split(":");

  const hour = Number.parseInt(hours, 10);

  const ampm = hour >= 12 ? "PM" : "AM";

  const hour12 = hour % 12 || 12;

  return `${hour12}:${minutes} ${ampm}`;
};

// --------------------------------------------------
// FARE VALIDATION
// --------------------------------------------------

const isValidFare = (fare) => {
  const fareText = String(fare ?? "").trim();

  return (
    /^[0-9]+([.][0-9]{1,2})?$/.test(fareText) &&
    Number(fareText) > 0
  );
};

// --------------------------------------------------
// TEMPLATE TRIP VALIDATION
// --------------------------------------------------

const validateTemplateTrip = (trip) => {
  if (!isValidTime24(trip.time24)) {
    return "Please select a valid departure time.";
  }

  if (!DESTINATIONS.includes(trip.destination)) {
    return "Please select a valid destination.";
  }

  if (!String(trip.driver ?? "").trim()) {
    return "Please select a driver.";
  }

  if (!String(trip.plateNumber ?? "").trim()) {
    return "Please select a vehicle.";
  }

  if (!isValidFare(trip.fare)) {
    return "Please enter a valid fare amount.";
  }

  if (typeof trip.phone !== "string") {
    return "Invalid driver contact number.";
  }

  return null;
};

// --------------------------------------------------
// TEMPLATE TRIP DATA BUILDER
// --------------------------------------------------

// Explicitly constructs the allowed Firestore fields.
// This prevents document IDs or UI-only properties
// from being accidentally written to Firestore.

const buildTemplateTripData = (trip) => {
  return {
    departureTime: formatTimeDisplay(trip.time24),

    destination: trip.destination,

    driver: String(trip.driver).trim(),

    fare: String(trip.fare).trim(),

    phone: trip.phone || "",

    plateNumber: String(trip.plateNumber).trim(),

    route: `St. Bernard to ${trip.destination}`,

    time24: trip.time24,
  };
};

// --------------------------------------------------
// TRIP MANAGER
// --------------------------------------------------

const TripManager = ({ groupId, fleet, fares }) => {
  const [trips, setTrips] = useState([]);

  const [isAdding, setIsAdding] = useState(false);

  const [newTrip, setNewTrip] = useState(
    createEmptyTrip(fares.Tacloban)
  );

  const [editingTripId, setEditingTripId] =
    useState(null);

  const [editTripData, setEditTripData] =
    useState({});

  const [isSavingNewTrip, setIsSavingNewTrip] =
    useState(false);

  const [isSavingEditedTrip, setIsSavingEditedTrip] =
    useState(false);

  const [deletingTripId, setDeletingTripId] =
    useState(null);

  // ------------------------------------------------
  // LISTEN TO NESTED SCHEDULE TRIPS
  // ------------------------------------------------

  useEffect(() => {
    const tripsCollection = collection(
      db,
      "schedule_groups",
      groupId,
      "trips"
    );

    const unsubscribe = onSnapshot(
      tripsCollection,

      (snapshot) => {
        setTrips(
          snapshot.docs.map((document) => ({
            ...document.data(),
            id: document.id,
          }))
        );
      },

      (error) => {
        console.error(
          "Schedule trip subscription failed:",
          error
        );

        toast.error(
          "Unable to load schedule trips."
        );
      }
    );

    return () => unsubscribe();
  }, [groupId]);

  // ------------------------------------------------
  // DRIVER AND VEHICLE SELECTION
  // ------------------------------------------------

  const handleDriverSelect = (
    event,
    isEditMode = false
  ) => {
    const selectedVan = fleet.find(
      (van) =>
        van.plateNumber === event.target.value
    );

    const driverData = {
      driver: selectedVan?.driver || "",

      plateNumber: selectedVan?.plateNumber || "",

      phone: selectedVan?.phone || "",
    };

    if (isEditMode) {
      setEditTripData((previous) => ({
        ...previous,
        ...driverData,
      }));
    } else {
      setNewTrip((previous) => ({
        ...previous,
        ...driverData,
      }));
    }
  };

  // ------------------------------------------------
  // DESTINATION CHANGE
  // ------------------------------------------------

  const handleNewDestinationChange = (event) => {
    const destination = event.target.value;

    setNewTrip((previous) => ({
      ...previous,
      destination,

      fare:
        fares[destination] !== undefined &&
        fares[destination] !== null
          ? String(fares[destination])
          : previous.fare,
    }));
  };

  const handleEditDestinationChange = (event) => {
    const destination = event.target.value;

    setEditTripData((previous) => ({
      ...previous,
      destination,

      fare:
        fares[destination] !== undefined &&
        fares[destination] !== null
          ? String(fares[destination])
          : previous.fare,
    }));
  };

  // ------------------------------------------------
  // ADD SCHEDULE TRIP
  // ------------------------------------------------

  const handleAddTrip = async (event) => {
    event.preventDefault();

    if (isSavingNewTrip) {
      return;
    }

    const validationError =
      validateTemplateTrip(newTrip);

    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsSavingNewTrip(true);

    try {
      const tripData =
        buildTemplateTripData(newTrip);

      await addDoc(
        collection(
          db,
          "schedule_groups",
          groupId,
          "trips"
        ),
        tripData
      );

      setNewTrip(
        createEmptyTrip(fares.Tacloban)
      );

      setIsAdding(false);

      toast.success(
        "Schedule trip added successfully."
      );
    } catch (error) {
      console.error(
        "Schedule trip creation failed:",
        error
      );

      toast.error(
        error.message ||
        "Failed to add schedule trip."
      );
    } finally {
      setIsSavingNewTrip(false);
    }
  };

  // ------------------------------------------------
  // OPEN TRIP EDIT FORM
  // ------------------------------------------------

  const handleOpenEdit = (trip) => {
    // Do not copy trip.id into editTripData.
    // Firestore rules do not allow an id field
    // inside nested schedule-trip documents.

    setEditTripData({
      time24: trip.time24 || "",

      destination: trip.destination || "",

      driver: trip.driver || "",

      plateNumber: trip.plateNumber || "",

      phone: trip.phone || "",

      fare: String(trip.fare ?? ""),
    });

    setEditingTripId(trip.id);
  };

  // ------------------------------------------------
  // UPDATE SCHEDULE TRIP
  // ------------------------------------------------

  const handleUpdateTrip = async (event) => {
    event.preventDefault();

    if (
      isSavingEditedTrip ||
      !editingTripId
    ) {
      return;
    }

    const validationError =
      validateTemplateTrip(editTripData);

    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsSavingEditedTrip(true);

    try {
      const tripData =
        buildTemplateTripData(editTripData);

      const tripRef = doc(
        db,
        "schedule_groups",
        groupId,
        "trips",
        editingTripId
      );

      await updateDoc(
        tripRef,
        tripData
      );

      setEditingTripId(null);
      setEditTripData({});

      toast.success(
        "Schedule trip updated successfully."
      );
    } catch (error) {
      console.error(
        "Schedule trip update failed:",
        error
      );

      toast.error(
        error.message ||
        "Failed to update schedule trip."
      );
    } finally {
      setIsSavingEditedTrip(false);
    }
  };

  // ------------------------------------------------
  // DELETE SCHEDULE TRIP
  // ------------------------------------------------

  const handleDeleteTrip = async (tripId) => {
    if (deletingTripId) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this schedule trip?"
    );

    if (!confirmed) {
      return;
    }

    setDeletingTripId(tripId);

    try {
      await deleteDoc(
        doc(
          db,
          "schedule_groups",
          groupId,
          "trips",
          tripId
        )
      );

      toast.success(
        "Schedule trip deleted successfully."
      );
    } catch (error) {
      console.error(
        "Schedule trip deletion failed:",
        error
      );

      toast.error(
        error.message ||
        "Failed to delete schedule trip."
      );
    } finally {
      setDeletingTripId(null);
    }
  };

  // ------------------------------------------------
  // RENDER TRIP MANAGER
  // ------------------------------------------------

  return (
    <div
      style={{
        padding: "15px",
        backgroundColor: "#f8f9fa",
        borderTop: "1px solid #ddd",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "15px",
        }}
      >
        <h5 style={{ margin: 0, fontSize: "1rem" }}>
          Trips in this Group
        </h5>

        <button
          type="button"
          onClick={() => setIsAdding((previous) => !previous)}
          className="btn btn-primary"
          style={{
            padding: "6px 12px",
            fontSize: "12px",
          }}
          disabled={isSavingNewTrip}
        >
          {isAdding ? "Cancel" : "+ Add Trip"}
        </button>
      </div>

      {isAdding && (
        <form
          onSubmit={handleAddTrip}
          className="form-group"
          style={{
            marginBottom: "15px",
            padding: "15px",
            backgroundColor: "#fff",
            border: "1px solid #ccc",
            borderRadius: "8px",
          }}
        >
          <label className="form-label">
            Departure Time
          </label>

          <input
            type="time"
            value={newTrip.time24}
            onChange={(event) =>
              setNewTrip((previous) => ({
                ...previous,
                time24: event.target.value,
              }))
            }
            required
            className="input-field"
          />

          <label
            className="form-label"
            style={{ marginTop: "5px" }}
          >
            Route
          </label>

          <div className="template-route-group">
            <input
              type="text"
              value="St. Bernard"
              readOnly
              className="input-field"
              style={{
                backgroundColor: "var(--bg)",
                color: "var(--muted)",
                textAlign: "center",
              }}
            />

            <div className="template-route-row">
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: "bold",
                }}
              >
                to
              </span>

              <select
                value={newTrip.destination}
                onChange={handleNewDestinationChange}
                className="input-field"
                style={{ flex: 1 }}
              >
                {DESTINATIONS.map((destination) => (
                  <option
                    key={destination}
                    value={destination}
                  >
                    {destination}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label
            className="form-label"
            style={{ marginTop: "5px" }}
          >
            Driver & Van
          </label>

          <select
            value={newTrip.plateNumber}
            onChange={(event) =>
              handleDriverSelect(event, false)
            }
            required
            className="input-field"
          >
            <option value="">
              -- Select Driver --
            </option>

            {fleet.map((van) => (
              <option
                key={van.id}
                value={van.plateNumber}
              >
                {van.driver} ({van.plateNumber})
              </option>
            ))}
          </select>

          <label
            className="form-label"
            style={{ marginTop: "5px" }}
          >
            Fare
          </label>

          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Fare"
            value={newTrip.fare}
            onChange={(event) =>
              setNewTrip((previous) => ({
                ...previous,
                fare: event.target.value,
              }))
            }
            required
            className="input-field"
          />

          <button
            type="submit"
            className="btn btn-success"
            style={{ marginTop: "15px" }}
            disabled={isSavingNewTrip}
          >
            {isSavingNewTrip
              ? "Saving..."
              : "Save Trip"}
          </button>
        </form>
      )}

      {trips.length === 0 ? (
        <p
          style={{
            fontSize: "13px",
            color: "#666",
          }}
        >
          No trips added yet.
        </p>
      ) : (
        <ul className="template-trip-list">
          {trips.map((trip) => (
            <li
              key={trip.id}
              className="template-trip-item"
            >
              {editingTripId === trip.id ? (
                <form
                  onSubmit={handleUpdateTrip}
                  className="form-group template-trip-edit"
                >
                  <input
                    type="time"
                    value={editTripData.time24 || ""}
                    onChange={(event) =>
                      setEditTripData((previous) => ({
                        ...previous,
                        time24: event.target.value,
                      }))
                    }
                    required
                    className="input-field"
                  />

                  <div className="template-route-group">
                    <input
                      type="text"
                      value="St. Bernard"
                      readOnly
                      className="input-field"
                      style={{
                        backgroundColor: "var(--bg)",
                        color: "var(--muted)",
                        textAlign: "center",
                      }}
                    />

                    <div className="template-route-row">
                      <span
                        style={{
                          fontSize: "14px",
                          fontWeight: "bold",
                        }}
                      >
                        to
                      </span>

                      <select
                        value={editTripData.destination || ""}
                        onChange={handleEditDestinationChange}
                        className="input-field"
                        style={{ flex: 1 }}
                      >
                        {DESTINATIONS.map((destination) => (
                          <option
                            key={destination}
                            value={destination}
                          >
                            {destination}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <select
                    value={editTripData.plateNumber || ""}
                    onChange={(event) =>
                      handleDriverSelect(event, true)
                    }
                    required
                    className="input-field"
                  >
                    <option value="">
                      -- Select Driver --
                    </option>

                    {fleet.map((van) => (
                      <option
                        key={van.id}
                        value={van.plateNumber}
                      >
                        {van.driver} ({van.plateNumber})
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editTripData.fare || ""}
                    onChange={(event) =>
                      setEditTripData((previous) => ({
                        ...previous,
                        fare: event.target.value,
                      }))
                    }
                    required
                    className="input-field"
                  />

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      marginTop: "10px",
                    }}
                  >
                    <button
                      type="submit"
                      className="btn btn-success"
                      style={{ flex: 1 }}
                      disabled={isSavingEditedTrip}
                    >
                      {isSavingEditedTrip
                        ? "Saving..."
                        : "Save"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingTripId(null);
                        setEditTripData({});
                      }}
                      className="btn btn-secondary"
                      style={{ flex: 1 }}
                      disabled={isSavingEditedTrip}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="template-trip-view">
                  <div className="template-trip-info">
                    <strong>
                      {trip.departureTime}
                    </strong>{" "}
                    - {trip.route}

                    <br />

                    <span className="template-trip-meta">
                      Driver: {trip.driver} | Fare: ₱{trip.fare}
                    </span>
                  </div>

                  <div className="template-trip-actions">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(trip)}
                      className="btn btn-warning"
                      style={{
                        flex: 1,
                        padding: "6px",
                      }}
                      disabled={
                        Boolean(deletingTripId) ||
                        isSavingEditedTrip
                      }
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteTrip(trip.id)
                      }
                      className="btn btn-danger"
                      style={{
                        flex: 1,
                        padding: "6px",
                      }}
                      disabled={
                        deletingTripId === trip.id
                      }
                    >
                      {deletingTripId === trip.id
                        ? "Deleting..."
                        : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// --------------------------------------------------
// MAIN TEMPLATE MANAGER
// --------------------------------------------------

const TemplateManager = ({ fleet, fares }) => {
  const [groups, setGroups] = useState([]);

  const [newGroup, setNewGroup] = useState(
    createEmptyScheduleGroup()
  );

  const [expandedGroupId, setExpandedGroupId] =
    useState(null);

  const [isCreatingGroup, setIsCreatingGroup] =
    useState(false);

  const [deletingGroupId, setDeletingGroupId] =
    useState(null);

  // ------------------------------------------------
  // LISTEN TO SCHEDULE GROUPS
  // ------------------------------------------------

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "schedule_groups"),

      (snapshot) => {
        setGroups(
          snapshot.docs.map((document) => ({
            id: document.id,
            ...document.data(),
          }))
        );
      },

      (error) => {
        console.error(
          "Schedule group subscription failed:",
          error
        );

        toast.error(
          "Unable to load schedule groups."
        );
      }
    );

    return () => unsubscribe();
  }, []);

  // ------------------------------------------------
  // CREATE SCHEDULE GROUP
  // ------------------------------------------------

  const handleCreateGroup = async (event) => {
    event.preventDefault();

    if (isCreatingGroup) {
      return;
    }

    const groupName = String(
      newGroup.name ?? ""
    ).trim();

    if (!groupName) {
      toast.error("Please enter a group name.");
      return;
    }

    const validDays =
      WEEKDAYS.every((day) =>
        typeof newGroup.days[day] === "boolean"
      );

    if (!validDays) {
      toast.error("Invalid schedule days.");
      return;
    }

    setIsCreatingGroup(true);

    try {
      await addDoc(
        collection(db, "schedule_groups"),
        {
          name: groupName,

          days: {
            ...newGroup.days,
          },
        }
      );

      setNewGroup(
        createEmptyScheduleGroup()
      );

      toast.success(
        "Schedule group created successfully."
      );
    } catch (error) {
      console.error(
        "Schedule group creation failed:",
        error
      );

      toast.error(
        error.message ||
        "Failed to create schedule group."
      );
    } finally {
      setIsCreatingGroup(false);
    }
  };

  // ------------------------------------------------
  // DELETE SCHEDULE GROUP AND NESTED TRIPS
  // ------------------------------------------------

  const handleDeleteGroup = async (groupId) => {
    if (deletingGroupId) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this entire group and all its schedule trips?"
    );

    if (!confirmed) {
      return;
    }

    setDeletingGroupId(groupId);

    try {
      const tripsSnapshot = await getDocs(
        collection(
          db,
          "schedule_groups",
          groupId,
          "trips"
        )
      );

      const tripDocuments = tripsSnapshot.docs;

      // Delete nested documents in manageable batches.
      // Leave the parent group until all child batches
      // have completed successfully.

      for (
        let index = 0;
        index < tripDocuments.length;
        index += DELETE_BATCH_SIZE
      ) {
        const batch = writeBatch(db);

        const currentChunk = tripDocuments.slice(
          index,
          index + DELETE_BATCH_SIZE
        );

        currentChunk.forEach((tripDocument) => {
          batch.delete(tripDocument.ref);
        });

        await batch.commit();
      }

      // Delete the parent only after its nested trips
      // have been successfully removed.

      await deleteDoc(
        doc(db, "schedule_groups", groupId)
      );

      if (expandedGroupId === groupId) {
        setExpandedGroupId(null);
      }

      toast.success(
        "Schedule group and its trips deleted successfully."
      );
    } catch (error) {
      console.error(
        "Schedule group deletion failed:",
        error
      );

      toast.error(
        error.message ||
        "Failed to delete schedule group."
      );
    } finally {
      setDeletingGroupId(null);
    }
  };

  // ------------------------------------------------
  // RENDER TEMPLATE MANAGER
  // ------------------------------------------------

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Schedule Groups</h1>
        <p>
          Group multiple trips under one schedule
        </p>
      </header>

      <form
        onSubmit={handleCreateGroup}
        className="form-container form-group"
      >
        <h3>Create New Schedule Group</h3>

        <input
          type="text"
          placeholder="Group Name (e.g., Weekday Schedule)"
          value={newGroup.name}
          onChange={(event) =>
            setNewGroup((previous) => ({
              ...previous,
              name: event.target.value,
            }))
          }
          required
          maxLength={100}
          className="input-field"
        />

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            marginTop: "5px",
          }}
        >
          <strong>Active Days:</strong>

          {WEEKDAYS.map((day) => (
            <label
              key={day}
              style={{ cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={newGroup.days[day]}
                onChange={() =>
                  setNewGroup((previous) => ({
                    ...previous,

                    days: {
                      ...previous.days,
                      [day]: !previous.days[day],
                    },
                  }))
                }
              />{" "}
              {day}
            </label>
          ))}
        </div>

        <button
          type="submit"
          className="btn btn-success"
          style={{ marginTop: "10px" }}
          disabled={isCreatingGroup}
        >
          {isCreatingGroup
            ? "Creating..."
            : "Create Group"}
        </button>
      </form>

      <div>
        <h3>Your Schedule Groups</h3>

        {groups.map((group) => (
          <div
            key={group.id}
            className="template-card"
          >
            <div
              className="template-header"
              onClick={() =>
                setExpandedGroupId(
                  expandedGroupId === group.id
                    ? null
                    : group.id
                )
              }
            >
              <div>
                <h4 className="template-title">
                  {group.name}
                </h4>

                <span className="template-days">
                  Days:{" "}
                  {WEEKDAYS
                    .filter(
                      (day) => group.days?.[day] === true
                    )
                    .join(", ")}
                </span>
              </div>

              <div className="template-header-actions">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDeleteGroup(group.id);
                  }}
                  className="btn-outline"
                  style={{ fontSize: "12px" }}
                  disabled={
                    deletingGroupId === group.id
                  }
                >
                  {deletingGroupId === group.id
                    ? "Deleting..."
                    : "Delete"}
                </button>

                <span>
                  {expandedGroupId === group.id
                    ? "▲"
                    : "▼"}
                </span>
              </div>
            </div>

            {expandedGroupId === group.id && (
              <TripManager
                groupId={group.id}
                fleet={fleet}
                fares={fares}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TemplateManager;
