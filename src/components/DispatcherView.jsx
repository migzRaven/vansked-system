
import { useEffect, useState } from "react";

import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";

import toast from "react-hot-toast";

import { db } from "../firebase";
import { useAuth } from "../context/useAuth";

import "./DispatcherView.css";

// --------------------------------------------------
// CONSTANTS
// --------------------------------------------------

const DESTINATIONS = [
  "Tacloban",
  "Sogod",
  "Bato",
];

const DEFAULT_CAPACITY = 14;

const ALLOWED_STATUSES = [
  "Waiting",
  "Boarding",
  "Full",
  "Overdue",
];

// --------------------------------------------------
// DATE AND TIME UTILITIES
// --------------------------------------------------

const getManilaDate = () => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
};

const formatTimeDisplay = (time24) => {
  if (!time24 || !/^\d{2}:\d{2}$/.test(time24)) {
    return "";
  }

  const [hours, minutes] = time24.split(":");
  const hour = Number.parseInt(hours, 10);

  if (hour > 23 || Number(minutes) > 59) {
    return "";
  }

  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;

  return `${hour12}:${minutes} ${ampm}`;
};

const getTimestampForToday = (time24) => {
  if (!time24 || !/^\d{2}:\d{2}$/.test(time24)) {
    return null;
  }

  const [hours, minutes] = time24.split(":");

  if (
    Number(hours) > 23 ||
    Number(minutes) > 59
  ) {
    return null;
  }

  const date = getManilaDate();

  const dateTime = new Date(
    `${date}T${time24}:00+08:00`
  );

  if (Number.isNaN(dateTime.getTime())) {
    return null;
  }

  return Timestamp.fromDate(dateTime);
};

const getInitialStatus = (departureTimestamp) => {
  if (!departureTimestamp) {
    return "Waiting";
  }

  const departureTime = departureTimestamp.toMillis();
  const thirtyMinutes = 30 * 60 * 1000;

  return Date.now() > departureTime + thirtyMinutes
    ? "Overdue"
    : "Waiting";
};

const getTimestampValue = (value) => {
  if (value && typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return 0;
};

// --------------------------------------------------
// PUBLIC PASSENGER TRIP PROJECTION
// --------------------------------------------------

// Public documents contain only information needed
// by the passenger board.
//
// Do not include:
// - Staff account information
// - Actor UID or actor email
// - Audit events
// - Internal template IDs
// - Other private dispatch metadata

const createPublicTripData = (trip) => {
  const capacity = Number(trip.capacity);
  const seatsTaken = Number(trip.seatsTaken);
  const vacantSeats = Number(trip.vacantSeats);

  if (
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > 100
  ) {
    throw new Error("Invalid public trip capacity.");
  }

  if (
    !Number.isInteger(seatsTaken) ||
    seatsTaken < 0 ||
    seatsTaken > capacity
  ) {
    throw new Error("Invalid public trip seat count.");
  }

  if (
    !Number.isInteger(vacantSeats) ||
    vacantSeats < 0 ||
    vacantSeats > capacity
  ) {
    throw new Error("Invalid public trip vacancy count.");
  }

  if (
    typeof trip.date !== "string" ||
    !trip.date
  ) {
    throw new Error("Invalid public trip date.");
  }

  if (
    !trip.departureAt ||
    typeof trip.departureAt.toMillis !== "function"
  ) {
    throw new Error("Invalid public trip departure timestamp.");
  }

  return {
    date: trip.date,

    departureAt: trip.departureAt,

    departureTime: String(
      trip.departureTime ?? ""
    ),

    route: String(
      trip.route ?? ""
    ),

    driver: String(
      trip.driver ?? ""
    ),

    plateNumber: String(
      trip.plateNumber ?? ""
    ),

    phone: String(
      trip.phone ?? ""
    ),

    fare: String(
      trip.fare ?? ""
    ),

    capacity,

    seatsTaken,

    vacantSeats,

    status: String(
      trip.status ?? "Waiting"
    ),

    updatedAt: serverTimestamp(),
  };
};

// --------------------------------------------------
// AUDIT EVENT BUILDER
// --------------------------------------------------

const createAuditEvent = ({
  tripId,
  route,
  driver,
  action,
  previousStatus = null,
  newStatus = null,
  currentUser,
}) => {
  return {
    tripId,
    route: route || "",
    driver: driver || "",
    action,

    previousStatus,
    newStatus,

    actorUid: currentUser?.uid || null,
    actorEmail: currentUser?.email || null,

    timestamp: serverTimestamp(),
  };
};

// --------------------------------------------------
// DISPATCHER TRIP CARD
// --------------------------------------------------

const DispatcherTripCard = ({
  schedule,
  handleDelete,
  handleStatusChange,
}) => {
  const { currentUser, isAdmin } = useAuth();

  const [isDeparting, setIsDeparting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [editData, setEditData] = useState({
    time24: "",
    destination: "Tacloban",
    fare: "",
  });

  const [isFull, setIsFull] = useState(true);
  const [vacantSeats, setVacantSeats] = useState("1");

  const capacity =
    Number(schedule.capacity) > 0
      ? Number(schedule.capacity)
      : DEFAULT_CAPACITY;

  const isAlreadyDeparted =
    schedule.status === "Departed";

  const canEditTrip =
    !isAlreadyDeparted || isAdmin;

  // ------------------------------------------------
  // OPEN EDIT FORM
  // ------------------------------------------------

  const handleEditClick = () => {
    if (!canEditTrip) {
      toast.error(
        "Only an administrator can modify a departed trip."
      );
      return;
    }

    const destination =
      schedule.route?.split("to ")[1]?.trim() ||
      "Tacloban";

    setEditData({
      time24: schedule.time24 || "",
      destination,
      fare: String(schedule.fare ?? ""),
    });

    setIsEditing(true);
  };

  // ------------------------------------------------
  // SAVE EDITED TRIP
  // ------------------------------------------------

  const handleSaveEdit = async (event) => {
    event.preventDefault();

    if (isSaving) return;

    if (!editData.time24) {
      toast.error("Please select a departure time.");
      return;
    }

    if (!DESTINATIONS.includes(editData.destination)) {
      toast.error("Please select a valid destination.");
      return;
    }

    if (!String(editData.fare).trim()) {
      toast.error("Please enter the fare.");
      return;
    }

    const numericFare = Number(editData.fare);

    if (
      !Number.isFinite(numericFare) ||
      numericFare <= 0
    ) {
      toast.error("Please enter a valid fare.");
      return;
    }

    const departureTimestamp =
      getTimestampForToday(editData.time24);

    if (!departureTimestamp) {
      toast.error("Invalid departure time.");
      return;
    }

    const finalRoute =
      `St. Bernard to ${editData.destination}`;

    const displayTime =
      formatTimeDisplay(editData.time24);

    const tripRef = doc(db, "trips", schedule.id);

    const publicTripRef = doc(
      db,
      "public_trips",
      schedule.id
    );

    const eventRef = doc(
      collection(db, "trip_events")
    );

    setIsSaving(true);

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const snapshot = await transaction.get(tripRef);

          if (!snapshot.exists()) {
            throw new Error("Trip no longer exists.");
          }

          const currentTrip = snapshot.data();

          if (
            currentTrip.status === "Departed" &&
            !isAdmin
          ) {
            throw new Error(
              "Only an administrator can modify a departed trip."
            );
          }

          const nextTrip = {
            ...currentTrip,

            time24: editData.time24,
            departureAt: departureTimestamp,
            departureTime: displayTime,
            route: finalRoute,
            fare: String(editData.fare).trim(),
            updatedAt: serverTimestamp(),
          };

          // Update the private trip.
          transaction.update(tripRef, {
            time24: editData.time24,
            departureAt: departureTimestamp,
            departureTime: displayTime,
            route: finalRoute,
            fare: String(editData.fare).trim(),
            updatedAt: serverTimestamp(),
          });

          // Update the public passenger projection.
          transaction.set(
            publicTripRef,
            createPublicTripData(nextTrip)
          );

          // Preserve the audit record.
          transaction.set(
            eventRef,
            createAuditEvent({
              tripId: schedule.id,
              route: finalRoute,
              driver: currentTrip.driver,
              action: "Trip information updated",
              previousStatus: currentTrip.status,
              newStatus: currentTrip.status,
              currentUser,
            })
          );
        }
      );

      setIsEditing(false);

      toast.success("Trip updated successfully.");
    } catch (error) {
      console.error("Trip editing failed:", error);

      toast.error(
        error.message || "Failed to update trip."
      );
    } finally {
      setIsSaving(false);
    }
  };

  // ------------------------------------------------
  // OPEN DEPARTURE DIALOG
  // ------------------------------------------------

  const openDepartureDialog = () => {
    if (isAlreadyDeparted) {
      toast.error("This trip has already departed.");
      return;
    }

    setIsFull(true);
    setVacantSeats("1");
    setIsDeparting(true);
  };

  // ------------------------------------------------
  // CONFIRM DEPARTURE
  // ------------------------------------------------

  const confirmDeparture = async () => {
    if (isSaving) return;

    const enteredVacantSeats =
      isFull ? 0 : Number(vacantSeats);

    if (
      !Number.isInteger(enteredVacantSeats) ||
      enteredVacantSeats < 0 ||
      enteredVacantSeats > capacity
    ) {
      toast.error(
        `Vacant seats must be between 0 and ${capacity}.`
      );
      return;
    }

    if (!isFull && enteredVacantSeats < 1) {
      toast.error(
        "Select Full if the van has no vacant seats."
      );
      return;
    }

    const tripRef = doc(db, "trips", schedule.id);

    const publicTripRef = doc(
      db,
      "public_trips",
      schedule.id
    );

    const eventRef = doc(
      collection(db, "trip_events")
    );

    setIsSaving(true);

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const snapshot = await transaction.get(tripRef);

          if (!snapshot.exists()) {
            throw new Error("Trip no longer exists.");
          }

          const currentTrip = snapshot.data();

          if (currentTrip.status === "Departed") {
            throw new Error(
              "This trip has already been marked as departed."
            );
          }

          const actualCapacity =
            Number(currentTrip.capacity) > 0
              ? Number(currentTrip.capacity)
              : capacity;

          if (
            enteredVacantSeats > actualCapacity
          ) {
            throw new Error(
              "Vacant seats cannot exceed vehicle capacity."
            );
          }

          const finalSeatsTaken =
            actualCapacity - enteredVacantSeats;

          const nextTrip = {
            ...currentTrip,

            status: "Departed",
            vacantSeats: enteredVacantSeats,
            seatsTaken: finalSeatsTaken,
          };

          // Update private dispatch information.
          transaction.update(tripRef, {
            status: "Departed",
            vacantSeats: enteredVacantSeats,
            seatsTaken: finalSeatsTaken,
            departureConfirmedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          // Publish the departure and remaining seats.
          transaction.set(
            publicTripRef,
            createPublicTripData(nextTrip)
          );

          transaction.set(
            eventRef,
            createAuditEvent({
              tripId: schedule.id,
              route: currentTrip.route,
              driver: currentTrip.driver,
              action:
                `Departed (${enteredVacantSeats} vacant seats)`,
              previousStatus: currentTrip.status,
              newStatus: "Departed",
              currentUser,
            })
          );
        }
      );

      setIsDeparting(false);
      setVacantSeats("1");
      setIsFull(true);

      toast.success("Departure confirmed successfully.");
    } catch (error) {
      console.error(
        "Departure confirmation failed:",
        error
      );

      toast.error(
        error.message || "Error confirming departure."
      );
    } finally {
      setIsSaving(false);
    }
  };

  // ------------------------------------------------
  // RENDER TRIP CARD
  // ------------------------------------------------

  return (
    <div className="trip-card">
      {isEditing ? (
        <form
          onSubmit={handleSaveEdit}
          className="trip-card-edit-form"
        >
          <h4 style={{ marginBottom: "10px" }}>
            Edit Trip
          </h4>

          <label className="form-label">
            Time
          </label>

          <input
            type="time"
            value={editData.time24}
            onChange={(event) =>
              setEditData((previous) => ({
                ...previous,
                time24: event.target.value,
              }))
            }
            required
            className="input-field"
          />

          <label className="form-label">
            Destination
          </label>

          <select
            value={editData.destination}
            onChange={(event) =>
              setEditData((previous) => ({
                ...previous,
                destination: event.target.value,
              }))
            }
            className="input-field"
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

          <label className="form-label">
            Fare
          </label>

          <input
            type="number"
            min="0.01"
            step="0.01"
            value={editData.fare}
            onChange={(event) =>
              setEditData((previous) => ({
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
              gap: "10px",
              marginTop: "10px",
            }}
          >
            <button
              type="submit"
              className="btn btn-success"
              style={{ flex: 1 }}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>

            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="btn btn-secondary"
              style={{ flex: 1 }}
              disabled={isSaving}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="trip-header">
            <div>
              <h3>
                {schedule.departureTime} - {schedule.route}
              </h3>

              <p>
                {schedule.driver} ({schedule.plateNumber})
                {" "}· Capacity: {capacity}
                {" "}· ₱{schedule.fare}
              </p>
            </div>

            <div className="trip-card-actions">
              <button
                type="button"
                onClick={handleEditClick}
                className="btn-icon"
                title="Edit"
                disabled={!canEditTrip}
              >
                ✏️
              </button>

              <button
                type="button"
                onClick={() => handleDelete(schedule.id)}
                className="btn-outline"
                title="Delete"
                disabled={
                  isAlreadyDeparted && !isAdmin
                }
              >
                ✕
              </button>
            </div>
          </div>

          {schedule.status === "Full" && (
            <div className="toggle-container">
              <span className="toggle-label">
                Automatic departure is temporarily
                disabled until server scheduling is configured.
                Please confirm departures manually.
              </span>
            </div>
          )}

          <div className="segmented-control">
            <button
              type="button"
              disabled={
                isAlreadyDeparted && !isAdmin
              }
              className={
                schedule.status === "Waiting"
                  ? "active-waiting"
                  : ""
              }
              onClick={() =>
                handleStatusChange(schedule.id, "Waiting")
              }
            >
              Waiting
            </button>

            <button
              type="button"
              disabled={
                isAlreadyDeparted && !isAdmin
              }
              className={
                schedule.status === "Boarding"
                  ? "active-boarding"
                  : ""
              }
              onClick={() =>
                handleStatusChange(schedule.id, "Boarding")
              }
            >
              Boarding
            </button>

            <button
              type="button"
              disabled={
                isAlreadyDeparted && !isAdmin
              }
              className={
                schedule.status === "Full"
                  ? "active-full"
                  : ""
              }
              onClick={() =>
                handleStatusChange(schedule.id, "Full")
              }
            >
              Full
            </button>

            <button
              type="button"
              disabled={isAlreadyDeparted}
              className={
                schedule.status === "Departed"
                  ? "active-departed"
                  : ""
              }
              onClick={openDepartureDialog}
            >
              Depart
            </button>

            <button
              type="button"
              disabled={
                isAlreadyDeparted && !isAdmin
              }
              className={
                schedule.status === "Overdue"
                  ? "active-overdue"
                  : ""
              }
              onClick={() =>
                handleStatusChange(schedule.id, "Overdue")
              }
            >
              Overdue
            </button>
          </div>

          {isAlreadyDeparted && (
            <p
              style={{
                fontSize: "0.85rem",
                color: "var(--muted)",
                marginTop: "8px",
              }}
            >
              Departed with{" "}
              {schedule.vacantSeats ?? 0} vacant seat(s).
            </p>
          )}

          {isDeparting && !isAlreadyDeparted && (
            <div className="departure-dialog">
              <h4 style={{ marginBottom: "8px" }}>
                Confirm Departure
              </h4>

              <div className="dialog-options">
                <label>
                  <input
                    type="radio"
                    name={`departure-${schedule.id}`}
                    checked={isFull}
                    onChange={() => setIsFull(true)}
                  />
                  Full
                </label>

                <label>
                  <input
                    type="radio"
                    name={`departure-${schedule.id}`}
                    checked={!isFull}
                    onChange={() => setIsFull(false)}
                  />
                  Has Vacancy
                </label>
              </div>

              {!isFull && (
                <div className="stepper-container">
                  <button
                    type="button"
                    className="stepper-btn"
                    onClick={() =>
                      setVacantSeats((previous) =>
                        String(
                          Math.max(
                            1,
                            Number(previous) - 1
                          )
                        )
                      )
                    }
                    disabled={Number(vacantSeats) <= 1}
                  >
                    −
                  </button>

                  <input
                    type="number"
                    min="1"
                    max={capacity}
                    step="1"
                    value={vacantSeats}
                    onChange={(event) =>
                      setVacantSeats(event.target.value)
                    }
                    className="stepper-input"
                  />

                  <button
                    type="button"
                    className="stepper-btn"
                    onClick={() =>
                      setVacantSeats((previous) =>
                        String(
                          Math.min(
                            capacity,
                            (Number(previous) || 0) + 1
                          )
                        )
                      )
                    }
                    disabled={
                      Number(vacantSeats) >= capacity
                    }
                  >
                    +
                  </button>
                </div>
              )}

              <p
                style={{
                  fontSize: "0.8rem",
                  color: "var(--muted)",
                  marginTop: "8px",
                }}
              >
                Vehicle capacity: {capacity} seats
              </p>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  marginTop: "10px",
                }}
              >
                <button
                  type="button"
                  onClick={confirmDeparture}
                  className="btn btn-success"
                  style={{ flex: 1 }}
                  disabled={isSaving}
                >
                  {isSaving ? "Confirming..." : "Confirm"}
                </button>

                <button
                  type="button"
                  onClick={() => setIsDeparting(false)}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  disabled={isSaving}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// --------------------------------------------------
// MAIN DISPATCHER VIEW
// --------------------------------------------------

const DispatcherView = ({
  schedules,
  fleet,
  fares,
  isOnline,
}) => {
  const { currentUser, isAdmin } = useAuth();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [availableTemplates, setAvailableTemplates] =
    useState([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingTrip, setIsSavingTrip] = useState(false);
  const [isSavingFare, setIsSavingFare] = useState(false);

  const [newTrip, setNewTrip] = useState({
    time24: "",
    destination: "Tacloban",
    driver: "",
    plateNumber: "",
    phone: "",
    fare: "",
    capacity: DEFAULT_CAPACITY,
    status: "Waiting",
  });

  // ------------------------------------------------
  // DASHBOARD CLOCK
  // ------------------------------------------------

  const [sortReferenceTime, setSortReferenceTime] =
    useState(0);

  useEffect(() => {
    const initialClockTimeout = window.setTimeout(() => {
      setSortReferenceTime(Date.now());
    }, 0);

    const clockInterval = window.setInterval(() => {
      setSortReferenceTime(Date.now());
    }, 60000);

    return () => {
      window.clearTimeout(initialClockTimeout);
      window.clearInterval(clockInterval);
    };
  }, []);

  // ------------------------------------------------
  // DASHBOARD COUNTERS
  // ------------------------------------------------

  const waitingCount = schedules.filter(
    (schedule) =>
      schedule.status === "Waiting" ||
      schedule.status === "Overdue"
  ).length;

  const boardingCount = schedules.filter(
    (schedule) => schedule.status === "Boarding"
  ).length;

  const fullCount = schedules.filter(
    (schedule) => schedule.status === "Full"
  ).length;

  const departedCount = schedules.filter(
    (schedule) => schedule.status === "Departed"
  ).length;

  const currentDate = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date());

  // ------------------------------------------------
  // NETWORK VALIDATION
  // ------------------------------------------------

  const ensureOnline = () => {
    if (!isOnline) {
      toast.error(
        "You are offline. Reconnect before changing dispatch records."
      );

      return false;
    }

    return true;
  };

  // ------------------------------------------------
  // DESTINATION CHANGE
  // ------------------------------------------------

  const handleDestinationChange = (event) => {
    const destination = event.target.value;

    const defaultFare = fares[destination];

    setNewTrip((previous) => ({
      ...previous,
      destination,
      fare:
        defaultFare !== undefined &&
        defaultFare !== null
          ? String(defaultFare)
          : "",
    }));
  };

  // ------------------------------------------------
  // OPEN TEMPLATE SELECTION
  // ------------------------------------------------

  const openTemplateModal = async () => {
    if (!ensureOnline()) return;

    try {
      const todayDay = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        weekday: "short",
      }).format(new Date());

      const groupsSnapshot = await getDocs(
        collection(db, "schedule_groups")
      );

      const activeGroups = groupsSnapshot.docs
        .map((document) => ({
          id: document.id,
          ...document.data(),
        }))
        .filter(
          (group) =>
            group.days &&
            group.days[todayDay]
        );

      setAvailableTemplates(activeGroups);
      setIsModalOpen(true);
    } catch (error) {
      console.error(
        "Template retrieval failed:",
        error
      );

      toast.error("Error fetching templates.");
    }
  };

  // ------------------------------------------------
  // GENERATE DAILY BOARD FROM TEMPLATE
  // ------------------------------------------------

  const generateSpecificTemplate = async (groupId) => {
    if (isGenerating || !ensureOnline()) return;

    setIsGenerating(true);

    let addedCount = 0;
    let skippedCount = 0;

    try {
      const todayStr = getManilaDate();

      const tripsSnapshot = await getDocs(
        collection(
          db,
          "schedule_groups",
          groupId,
          "trips"
        )
      );

      for (const tripDocument of tripsSnapshot.docs) {
        const trip = tripDocument.data();

        const newTripRef = doc(
          db,
          "trips",
          `${todayStr}_${tripDocument.id}`
        );

        const publicTripRef = doc(
          db,
          "public_trips",
          newTripRef.id
        );

        const eventRef = doc(
          collection(db, "trip_events")
        );

        const departureTimestamp =
          getTimestampForToday(trip.time24);

        if (!departureTimestamp) {
          throw new Error(
            `Invalid departure time in template: ${trip.departureTime || tripDocument.id}`
          );
        }

        const selectedVan = fleet.find(
          (van) =>
            van.plateNumber === trip.plateNumber
        );

        const tripCapacity =
          Number(trip.capacity) > 0
            ? Number(trip.capacity)
            : Number(selectedVan?.capacity) > 0
              ? Number(selectedVan.capacity)
              : DEFAULT_CAPACITY;

        const initialStatus =
          getInitialStatus(departureTimestamp);

        const finalTrip = {
          date: todayStr,
          time24: trip.time24 || "",
          departureAt: departureTimestamp,

          departureTime:
            trip.departureTime ||
            formatTimeDisplay(trip.time24),

          route: trip.route || "",

          driver:
            trip.driver ||
            selectedVan?.driver ||
            "",

          plateNumber:
            trip.plateNumber ||
            selectedVan?.plateNumber ||
            "",

          phone:
            trip.phone ||
            selectedVan?.phone ||
            "",

          fare: String(trip.fare ?? ""),
          capacity: tripCapacity,
          seatsTaken: 0,
          status: initialStatus,
          vacantSeats: 0,

          sourceTemplateId: groupId,

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const wasCreated = await runTransaction(
          db,
          async (transaction) => {
            const existingTrip =
              await transaction.get(newTripRef);

            if (existingTrip.exists()) {
              return false;
            }

            // Create private trip.
            transaction.set(
              newTripRef,
              finalTrip
            );

            // Create its public passenger projection.
            transaction.set(
              publicTripRef,
              createPublicTripData(finalTrip)
            );

            // Create audit event.
            transaction.set(
              eventRef,
              createAuditEvent({
                tripId: newTripRef.id,
                route: finalTrip.route,
                driver: finalTrip.driver,
                action: "Trip generated from schedule template",
                newStatus: initialStatus,
                currentUser,
              })
            );

            return true;
          }
        );

        if (wasCreated) {
          addedCount++;
        } else {
          skippedCount++;
        }
      }

      toast.success(
        `Generated ${addedCount} trip(s). ${skippedCount} existing trip(s) were skipped.`
      );

      setIsModalOpen(false);
    } catch (error) {
      console.error(
        "Template generation failed:",
        error
      );

      toast.error(
        `Template generation stopped. ${addedCount} trip(s) were created, and ${skippedCount} were skipped. ${error.message || ""}`
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // ------------------------------------------------
  // DRIVER AND VEHICLE SELECTION
  // ------------------------------------------------

  const handleDriverSelect = (event) => {
    const selectedVan = fleet.find(
      (van) =>
        van.plateNumber === event.target.value
    );

    setNewTrip((previous) => ({
      ...previous,

      driver: selectedVan
        ? selectedVan.driver
        : "",

      plateNumber: selectedVan
        ? selectedVan.plateNumber
        : "",

      phone: selectedVan
        ? selectedVan.phone || ""
        : "",

      capacity:
        selectedVan &&
        Number(selectedVan.capacity) > 0
          ? Number(selectedVan.capacity)
          : DEFAULT_CAPACITY,
    }));
  };

  // ------------------------------------------------
  // CHANGE TRIP STATUS
  // ------------------------------------------------

  const handleStatusChange = async (id, newStatus) => {
    if (!ensureOnline()) return;

    if (!ALLOWED_STATUSES.includes(newStatus)) {
      toast.error("Invalid trip status.");
      return;
    }

    const tripRef = doc(db, "trips", id);

    const publicTripRef = doc(
      db,
      "public_trips",
      id
    );

    const eventRef = doc(
      collection(db, "trip_events")
    );

    try {
      const wasUpdated = await runTransaction(
        db,
        async (transaction) => {
          const snapshot = await transaction.get(tripRef);

          if (!snapshot.exists()) {
            throw new Error("Trip no longer exists.");
          }

          const currentTrip = snapshot.data();

          if (currentTrip.status === "Departed") {
            throw new Error(
              "This trip has already departed."
            );
          }

          if (currentTrip.status === newStatus) {
            return false;
          }

          const nextTrip = {
            ...currentTrip,
            status: newStatus,
            vacantSeats: 0,
          };

          // Update private status.
          transaction.update(tripRef, {
            status: newStatus,
            vacantSeats: 0,
            statusUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          // Publish the same status.
          transaction.set(
            publicTripRef,
            createPublicTripData(nextTrip)
          );

          // Record the status change.
          transaction.set(
            eventRef,
            createAuditEvent({
              tripId: id,
              route: currentTrip.route,
              driver: currentTrip.driver,
              action: `Status changed to ${newStatus}`,
              previousStatus: currentTrip.status,
              newStatus,
              currentUser,
            })
          );

          return true;
        }
      );

      if (wasUpdated) {
        toast.success(
          `Trip status changed to ${newStatus}.`
        );
      }
    } catch (error) {
      console.error(
        "Trip status update failed:",
        error
      );

      toast.error(
        error.message || "Action failed."
      );
    }
  };

  // ------------------------------------------------
  // SAVE DEFAULT FARE
  // ------------------------------------------------

  // Shared default fares belong to the master fare
  // table and are admin-managed in Firestore rules.
  // Dispatchers set the fare per trip when creating
  // it; that value is stored on the trip and its
  // public projection, never in the fares
  // collection.

  const handleSaveDefaultFare = async () => {
    if (!isAdmin) {
      toast.error(
        "Only administrators can update default fares."
      );
      return;
    }

    if (isSavingFare || !ensureOnline()) return;

    const fareText = String(newTrip.fare).trim();
    const numericFare = Number(fareText);

    if (
      !fareText ||
      !Number.isFinite(numericFare) ||
      numericFare <= 0
    ) {
      toast.error("Enter a valid fare amount.");
      return;
    }

    setIsSavingFare(true);

    try {
      await setDoc(
        doc(db, "fares", newTrip.destination),
        {
          amount: fareText,
        }
      );

      toast.success(
        "Fare updated successfully."
      );
    } catch (error) {
      console.error(
        "Default fare update failed:",
        error
      );

      toast.error("Error saving fare.");
    } finally {
      setIsSavingFare(false);
    }
  };

  // ------------------------------------------------
  // DELETE TRIP
  // ------------------------------------------------

  const handleDelete = async (id) => {
    if (!ensureOnline()) return;

    const confirmed = window.confirm(
      "Delete this trip? This action will be recorded in the activity history."
    );

    if (!confirmed) return;

    const tripRef = doc(db, "trips", id);

    const publicTripRef = doc(
      db,
      "public_trips",
      id
    );

    const eventRef = doc(
      collection(db, "trip_events")
    );

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const snapshot = await transaction.get(tripRef);

          if (!snapshot.exists()) {
            throw new Error("Trip no longer exists.");
          }

          const currentTrip = snapshot.data();

          if (currentTrip.status === "Departed") {
            throw new Error(
              "Departed trips cannot be deleted through the normal dispatcher interface."
            );
          }

          // Remove private trip.
          transaction.delete(tripRef);

          // Remove its public passenger projection.
          transaction.delete(publicTripRef);

          // Preserve the deletion audit event.
          transaction.set(
            eventRef,
            createAuditEvent({
              tripId: id,
              route: currentTrip.route,
              driver: currentTrip.driver,
              action: "Trip deleted",
              previousStatus: currentTrip.status,
              currentUser,
            })
          );
        }
      );

      toast.success("Trip deleted successfully.");
    } catch (error) {
      console.error("Trip deletion failed:", error);

      toast.error(
        error.message || "Failed to delete trip."
      );
    }
  };

  // ------------------------------------------------
  // ADD NEW TRIP
  // ------------------------------------------------

  const handleAddTrip = async (event) => {
    event.preventDefault();

    if (isSavingTrip || !ensureOnline()) return;

    if (!newTrip.time24) {
      toast.error("Please select a departure time.");
      return;
    }

    if (!newTrip.plateNumber || !newTrip.driver) {
      toast.error("Please select a driver and vehicle.");
      return;
    }

    if (!DESTINATIONS.includes(newTrip.destination)) {
      toast.error("Please select a valid destination.");
      return;
    }

    const fareText = String(newTrip.fare).trim();
    const numericFare = Number(fareText);

    if (
      !fareText ||
      !Number.isFinite(numericFare) ||
      numericFare <= 0
    ) {
      toast.error("Enter a valid fare amount.");
      return;
    }

    const capacity = Number(newTrip.capacity);

    if (
      !Number.isInteger(capacity) ||
      capacity < 1 ||
      capacity > 100
    ) {
      toast.error("Invalid vehicle capacity.");
      return;
    }

    const todayStr = getManilaDate();

    const finalRoute =
      `St. Bernard to ${newTrip.destination}`;

    const displayTime =
      formatTimeDisplay(newTrip.time24);

    const departureTimestamp =
      getTimestampForToday(newTrip.time24);

    if (!departureTimestamp) {
      toast.error("Invalid departure time.");
      return;
    }

    const initialStatus =
      getInitialStatus(departureTimestamp);

    const tripRef = doc(
      collection(db, "trips")
    );

    const publicTripRef = doc(
      db,
      "public_trips",
      tripRef.id
    );

    const eventRef = doc(
      collection(db, "trip_events")
    );

    const tripData = {
      date: todayStr,
      time24: newTrip.time24,
      departureAt: departureTimestamp,
      departureTime: displayTime,
      route: finalRoute,
      driver: newTrip.driver,
      plateNumber: newTrip.plateNumber,
      phone: newTrip.phone || "",
      fare: fareText,
      capacity,
      seatsTaken: 0,
      status: initialStatus,
      vacantSeats: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    setIsSavingTrip(true);

    try {
      await runTransaction(
        db,
        async (transaction) => {
          // Create private trip.
          transaction.set(
            tripRef,
            tripData
          );

          // Create public passenger projection.
          transaction.set(
            publicTripRef,
            createPublicTripData(tripData)
          );

          // Create audit event.
          transaction.set(
            eventRef,
            createAuditEvent({
              tripId: tripRef.id,
              route: finalRoute,
              driver: newTrip.driver,
              action: "Trip created manually",
              newStatus: initialStatus,
              currentUser,
            })
          );
        }
      );

      setNewTrip({
        time24: "",
        destination: "Tacloban",
        driver: "",
        plateNumber: "",
        phone: "",
        fare: String(fares.Tacloban ?? ""),
        capacity: DEFAULT_CAPACITY,
        status: "Waiting",
      });

      setIsFormOpen(false);

      toast.success("Trip created successfully.");
    } catch (error) {
      console.error("Trip creation failed:", error);

      toast.error(
        error.message || "Error saving trip."
      );
    } finally {
      setIsSavingTrip(false);
    }
  };

  // ------------------------------------------------
  // SORT DAILY SCHEDULES
  // ------------------------------------------------

  const sortedSchedules = [...schedules].sort(
    (a, b) => {
      if (
        a.status === "Departed" &&
        b.status !== "Departed"
      ) {
        return 1;
      }

      if (
        a.status !== "Departed" &&
        b.status === "Departed"
      ) {
        return -1;
      }

      const now = sortReferenceTime;

      const aTime = getTimestampValue(a.departureAt);
      const bTime = getTimestampValue(b.departureAt);

      const thirtyMinutes = 30 * 60 * 1000;

      const aIsPast =
        (now > 0 &&
          aTime > 0 &&
          now > aTime + thirtyMinutes) ||
        a.status === "Overdue";

      const bIsPast =
        (now > 0 &&
          bTime > 0 &&
          now > bTime + thirtyMinutes) ||
        b.status === "Overdue";

      if (aIsPast && !bIsPast) return 1;
      if (!aIsPast && bIsPast) return -1;

      return aTime - bTime;
    }
  );

  // ------------------------------------------------
  // RENDER DASHBOARD
  // ------------------------------------------------

  return (
    <div className="app-container">

      <header className="dispatcher-header">
        <div className="dispatcher-header-left">
          <h1>Dispatcher Dashboard</h1>

          <p className="dispatcher-subtitle">
            St. Bernard Terminal · {currentDate}
          </p>
        </div>

        <div className="dispatcher-header-right">
          <span className="staff-identity">
            {currentUser?.email || "Staff"}
          </span>

          <div
            className={`live-indicator ${
              !isOnline ? "offline" : ""
            }`}
          >
            <span className="pulse-dot"></span>
            {!isOnline ? "Offline" : "Live"}
          </div>
        </div>
      </header>

      <div className="kpi-strip">
        <div className="kpi-card">
          <h4>Waiting</h4>
          <div className="kpi-value">
            {waitingCount}
          </div>
        </div>

        <div className="kpi-card">
          <h4>Boarding</h4>
          <div className="kpi-value">
            {boardingCount}
          </div>
        </div>

        <div className="kpi-card">
          <h4>Full</h4>
          <div className="kpi-value">
            {fullCount}
          </div>
        </div>

        <div className="kpi-card">
          <h4>Departed</h4>
          <div className="kpi-value">
            {departedCount}
          </div>
        </div>
      </div>

      <div className="action-bar">
        <button
          type="button"
          onClick={openTemplateModal}
          className="btn btn-warning"
          disabled={isGenerating || !isOnline}
        >
          ⚡ Generate Board
        </button>

        <button
          type="button"
          onClick={() => setIsFormOpen((previous) => !previous)}
          className="btn btn-success"
        >
          {isFormOpen ? "Cancel" : "+ Add Trip"}
        </button>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">
              Select Template to Generate
            </h3>

            <p className="modal-subtitle">
              Only templates active for today are shown.
            </p>

            {availableTemplates.length === 0 ? (
              <p style={{ color: "red" }}>
                No templates are scheduled for today.
              </p>
            ) : (
              <div className="template-list">
                {availableTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="modal-template-item"
                  >
                    <strong>
                      {template.name}
                    </strong>

                    <button
                      type="button"
                      onClick={() =>
                        generateSpecificTemplate(template.id)
                      }
                      disabled={isGenerating}
                      className="btn btn-primary"
                      style={{
                        padding: "6px 12px",
                        fontSize: "12px",
                      }}
                    >
                      {isGenerating ? "Generating..." : "Generate"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="btn btn-secondary modal-close-btn"
              disabled={isGenerating}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className="form-container">
          <form
            onSubmit={handleAddTrip}
            className="form-group"
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

            <label className="form-label">
              Route
            </label>

            <div className="form-route-group">
              <input
                type="text"
                value="St. Bernard"
                readOnly
                className="input-field form-route-readonly"
              />

              <div className="form-route-row">
                <span style={{ fontWeight: "bold" }}>
                  to
                </span>

                <select
                  value={newTrip.destination}
                  onChange={handleDestinationChange}
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

            <label className="form-label">
              Driver & Van
            </label>

            <select
              value={newTrip.plateNumber}
              onChange={handleDriverSelect}
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

            {newTrip.plateNumber && (
              <p className="form-label">
                Vehicle capacity: {newTrip.capacity} seats
              </p>
            )}

            <label className="form-label">
              Fare
            </label>

            <div className="form-fare-group">
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Fare in pesos"
                value={newTrip.fare}
                onChange={(event) =>
                  setNewTrip((previous) => ({
                    ...previous,
                    fare: event.target.value,
                  }))
                }
                required
                className="input-field"
                style={{ flex: 1 }}
              />

              {isAdmin && (
                <button
                  type="button"
                  onClick={handleSaveDefaultFare}
                  className="btn btn-secondary"
                  style={{ fontSize: "12px" }}
                  disabled={isSavingFare || !isOnline}
                >
                  {isSavingFare ? "Saving..." : "Save Default"}
                </button>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary form-submit-btn"
              disabled={isSavingTrip || !isOnline}
            >
              {isSavingTrip ? "Saving Trip..." : "Save Trip"}
            </button>
          </form>
        </div>
      )}

      <main>
        {sortedSchedules.length === 0 ? (
          <div className="empty-board">
            <h3>No trips on the board today.</h3>

            <p>
              Click "Generate Board" to load a template
              or add a trip manually.
            </p>
          </div>
        ) : (
          sortedSchedules.map((schedule) => (
            <DispatcherTripCard
              key={schedule.id}
              schedule={schedule}
              handleDelete={handleDelete}
              handleStatusChange={handleStatusChange}
            />
          ))
        )}
      </main>
    </div>
  );
};

export default DispatcherView;
