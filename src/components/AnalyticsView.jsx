
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { db } from "../firebase";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import "./AnalyticsView.css";

// --------------------------------------------------
// HISTORICAL VIEW (loaded on first selection)
// --------------------------------------------------

const HistoryDashboard = lazy(
  () => import("./HistoryDashboard")
);

// --------------------------------------------------
// MANILA DATE UTILITIES
// --------------------------------------------------

const manilaDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const getManilaDate = () => {
  const parts = Object.fromEntries(
    manilaDateFormatter
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
};

// --------------------------------------------------
// EVENT TIME FORMATTER
// --------------------------------------------------

const formatEventTime = (timestamp) => {
  if (!timestamp) {
    return "Pending";
  }

  try {
    let date;

    if (typeof timestamp.toDate === "function") {
      date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      return "Unavailable";
    }

    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "Unavailable";
    }

    return new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch (error) {
    console.error("Event timestamp formatting failed:", error);
    return "Unavailable";
  }
};

// --------------------------------------------------
// DESTINATION EXTRACTOR
// --------------------------------------------------

const getDestination = (route) => {
  if (typeof route !== "string" || !route.trim()) {
    return "Unknown";
  }

  const parts = route.trim().split(/\s+to\s+/i);

  if (parts.length < 2) {
    return "Unknown";
  }

  const destination = parts[parts.length - 1].trim();

  return destination || "Unknown";
};

// --------------------------------------------------
// ANALYTICS COMPONENT
// --------------------------------------------------

const AnalyticsView = () => {
  // ----------------------------------------------
  // DATE STATE
  // ----------------------------------------------

  const [todayStr, setTodayStr] = useState(() => getManilaDate());

  // ----------------------------------------------
  // VIEW SEGMENT (LIVE OPS / HISTORICAL)
  // ----------------------------------------------

  const [analyticsView, setAnalyticsView] =
    useState("live");

  const showHistorical =
    analyticsView === "historical";

  // The historical dashboard mounts on first selection
  // and stays mounted (hidden) afterwards so switching
  // views never destroys its state or triggers
  // duplicate scans.

  const [historyMounted, setHistoryMounted] =
    useState(false);

  // ----------------------------------------------
  // TRIP DATA STATE
  // ----------------------------------------------

  const [tripResult, setTripResult] = useState({
    date: null,
    trips: [],
    error: null,
  });

  // Data is considered loaded only when its date
  // matches the currently selected Manila date.
  const tripsLoading = tripResult.date !== todayStr;

 const todaysTrips = useMemo(
  () =>
    tripResult.date === todayStr
      ? tripResult.trips
      : [],
  [tripResult.date, tripResult.trips, todayStr]
);

  const tripsError =
    tripResult.date === todayStr ? tripResult.error : null;

  // ----------------------------------------------
  // EVENT DATA STATE
  // ----------------------------------------------

  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState(null);

  const loading = tripsLoading || eventsLoading;

  // ----------------------------------------------
  // MANILA MIDNIGHT ROLLOVER
  // ----------------------------------------------

  useEffect(() => {
    const interval = window.setInterval(() => {
      const currentDate = getManilaDate();

      setTodayStr((previousDate) =>
        previousDate !== currentDate ? currentDate : previousDate
      );
    }, 60000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  // ----------------------------------------------
  // LISTEN TO TODAY'S TRIPS
  // ----------------------------------------------

  useEffect(() => {
    const tripsQuery = query(
      collection(db, "trips"),
      where("date", "==", todayStr)
    );

    const unsubscribe = onSnapshot(
      tripsQuery,
      (snapshot) => {
        const trips = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));

        setTripResult({
          date: todayStr,
          trips,
          error: null,
        });
      },
      (error) => {
        console.error(
          "Analytics trip subscription failed:",
          error
        );

        setTripResult({
          date: todayStr,
          trips: [],
          error:
            "Unable to load today's trip information. Check your connection and permissions.",
        });
      }
    );

    return () => unsubscribe();
  }, [todayStr]);

  // ----------------------------------------------
  // LISTEN TO THE LATEST 50 EVENTS
  // ----------------------------------------------

  useEffect(() => {
    const eventsQuery = query(
      collection(db, "trip_events"),
      orderBy("timestamp", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      eventsQuery,
      (snapshot) => {
        const recentEvents = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));

        setEvents(recentEvents);
        setEventsError(null);
        setEventsLoading(false);
      },
      (error) => {
        console.error(
          "Analytics event subscription failed:",
          error
        );

        setEventsError(
          "Unable to load recent activity history. Check your connection and permissions."
        );

        setEventsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // ----------------------------------------------
  // CALCULATE TRIP METRICS
  // ----------------------------------------------

  const totalTrips = todaysTrips.length;

  const departedTrips = useMemo(
    () =>
      todaysTrips.filter(
        (trip) => trip.status === "Departed"
      ),
    [todaysTrips]
  );

  const totalDeparted = departedTrips.length;

  // Remaining vacant seats across departed vans only.
  const totalVacantSeatsLeft = departedTrips.reduce(
    (total, trip) => {
      const vacantSeats = Number(trip.vacantSeats);

      if (
        !Number.isFinite(vacantSeats) ||
        !Number.isInteger(vacantSeats) ||
        vacantSeats < 0
      ) {
        return total;
      }

      return total + vacantSeats;
    },
    0
  );

  // ----------------------------------------------
  // CALCULATE DESTINATION STATISTICS
  // ----------------------------------------------

  const chartData = useMemo(() => {
    const destinationCounts = new Map();

    todaysTrips.forEach((trip) => {
      const destination = getDestination(trip.route);

      destinationCounts.set(
        destination,
        (destinationCounts.get(destination) || 0) + 1
      );
    });

    return Array.from(destinationCounts, ([name, trips]) => ({
      name,
      trips,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [todaysTrips]);

  // ----------------------------------------------
  // ANALYTICS DASHBOARD
  // ----------------------------------------------

  return (
    <div className="app-container">

      {/* DASHBOARD HEADER */}

      <header className="app-header">
        <h1>Terminal Analytics & Event Log</h1>
        <p>Live Operations Overview</p>
      </header>

      {/* --------------------------------------
          VIEW SEGMENTED CONTROL
      -------------------------------------- */}

      <div
        className="analytics-view-switch"
        role="group"
        aria-label="Analytics view"
      >
        <button
          type="button"
          aria-pressed={analyticsView === "live"}
          className={
            analyticsView === "live"
              ? "analytics-switch-button active"
              : "analytics-switch-button"
          }
          onClick={() => setAnalyticsView("live")}
        >
          Live Ops
        </button>
        <button
          type="button"
          aria-pressed={showHistorical}
          className={
            showHistorical
              ? "analytics-switch-button active"
              : "analytics-switch-button"
          }
          onClick={() => {
            setAnalyticsView("historical");
            setHistoryMounted(true);
          }}
        >
          Historical
        </button>
      </div>

      {/* --------------------------------------
          HISTORICAL VIEW — lazily loaded on
          first selection, hidden while Live
          Ops is active (no remounts, no
          duplicate scans)
      -------------------------------------- */}

      {historyMounted ? (
        <div
          className="analytics-history-pane"
          hidden={!showHistorical}
        >
          <Suspense
            fallback={
              <div
                className="analytics-history-fallback"
                role="status"
                aria-live="polite"
              >
                Loading historical analytics…
              </div>
            }
          >
            <HistoryDashboard />
          </Suspense>
        </div>
      ) : null}

      {/* --------------------------------------
          LIVE OPS — existing implementation
      -------------------------------------- */}

      {analyticsView === "live" ? (
        <>
          {loading ? (
            <div
              style={{
                textAlign: "center",
                marginTop: "50px",
              }}
              role="status"
              aria-live="polite"
            >
              Loading analytics...
            </div>
          ) : (
            <>

      {/* ERROR NOTIFICATIONS */}

      {tripsError && (
        <div
          className="error-message"
          role="alert"
          style={{ marginBottom: "15px" }}
        >
          {tripsError}
        </div>
      )}

      {eventsError && (
        <div
          className="error-message"
          role="alert"
          style={{ marginBottom: "15px" }}
        >
          {eventsError}
        </div>
      )}

      {/* KPI CARDS */}

      <div className="analytics-kpi-strip">

        <div className="analytics-kpi">
          <h4>Total Trips Today</h4>
          <p>{totalTrips}</p>
        </div>

        <div className="analytics-kpi">
          <h4>Trips Departed</h4>
          <p>{totalDeparted}</p>
        </div>

        <div className="analytics-kpi">
          <h4>Vacant Seats on Departed Trips</h4>
          <p>{totalVacantSeatsLeft}</p>
        </div>

      </div>

      {/* DESTINATION CHART */}

      <div className="chart-container">
        <h3>Trips by Destination</h3>

        {chartData.length === 0 ? (
          <p
            style={{
              textAlign: "center",
              color: "var(--muted)",
              marginTop: "30px",
            }}
          >
            No trip data available for today.
          </p>
        ) : (
          <div
            style={{
              width: "100%",
              height: 300,
              marginTop: "20px",
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{
                  top: 5,
                  right: 20,
                  left: -20,
                  bottom: 5,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                />

                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                />

                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12 }}
                />

                <Tooltip />

                <Bar
                  dataKey="trips"
                  fill="var(--navy-700)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* EVENT LOG TABLE */}

      <div className="event-log-container">

        <h3>Live Event Log</h3>

        <p
          style={{
            fontSize: "13px",
            color: "var(--muted)",
            marginBottom: "15px",
          }}
        >
          Showing the latest 50 recorded dispatcher actions.
        </p>

        <div className="table-wrapper">

          <table className="event-table">

            <thead>
              <tr>
                <th>Time</th>
                <th>Route</th>
                <th>Driver</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>

              {events.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{ textAlign: "center" }}
                  >
                    {eventsError
                      ? "Activity history is unavailable."
                      : "No recorded events yet."}
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.id}>

                    <td className="mono">
                      {formatEventTime(event.timestamp)}
                    </td>

                    <td>
                      {event.route || "Unknown"}
                    </td>

                    <td>
                      {event.driver || "Unknown"}
                    </td>

                    <td>
                      <span className="event-badge">
                        {event.action || "Activity recorded"}
                      </span>
                    </td>

                  </tr>
                ))
              )}

            </tbody>

          </table>

        </div>
      </div>

            </>
          )}
        </>
      ) : null}

    </div>
  );
};

export default AnalyticsView;
