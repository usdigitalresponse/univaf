import React from "react";
import "./location-info.css";

// TODO: this should come from a package that does it better.
function timeAgo(time) {
  const delta = Date.now() - time;
  if (delta < 60 * 1000) return "< 1 minute ago";

  const days = Math.floor(delta / (1000 * 60 * 60 * 24));
  const hours = Math.floor((delta % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((delta % (1000 * 60 * 60)) / (1000 * 60));

  if (days) return `${days} days, ${hours} hours ago`;
  if (hours) return `${hours} hours, ${minutes} minutes ago`;
  return `${minutes} minutes ago`;
}

export default function LocationInfo(props) {
  const data = props.location;
  const available = data.availability?.available?.toLowerCase() || "unknown";

  const availableDisplay = {
    yes: { text: "Appointments", icon: "✅" }, // or '✔︎'
    no: { text: "No Appointments", icon: "❌" }, // or '✘'
  }[available] || { text: "Possible", icon: "?" };

  let updateText = "-";
  if (data.availability) {
    updateText = timeAgo(new Date(data.availability.updated_at));
  }

  let displayUrl = data.booking_url && data.booking_url;
  if (displayUrl) {
    displayUrl = displayUrl.replace(/^https?:\/\//, "");
  }

  let address = data.address_lines.join(" ");
  if (data.city) address = `${address}, ${data.city}`;
  if (data.state) address = `${address}, ${data.state}`;
  if (data.postal_code) address = `${address} ${data.postal_code}`;

  let massVaxTag = null;
  if (data.location_type === "mass_vax") {
    massVaxTag = (
      <span className="indicator-mass-vax">Mass Vaccination Center</span>
    );
  }

  return (
    <div className="location-list-item">
      <div className={`list-availability availability-${available}`}>
        <span className="availability-icon">{availableDisplay.icon}</span>
        <span className="availability-text">{availableDisplay.text}</span>
        <span className="availability-update">({updateText})</span>
      </div>
      <div className="list-location-info">
        <header>
          <h2 className="list-location-name">{data.name}</h2>
          {massVaxTag}
        </header>
        <div>{address}</div>
        <CallToAction location={data} />
        <div
          className="list-location-description"
          dangerouslySetInnerHTML={{ __html: data.description }}
        />
      </div>
    </div>
  );
}

function CallToAction({ location }) {
  let bookingLink = null;
  if (location.booking_url) {
    const text = location.requires_waitlist ? "Join Waitlist" : "Book Online";
    bookingLink = (
      <a className="location-info--booking-link" target="_blank" href={location.booking_url}>
        {text}
      </a>
    );
  }

  let callLink = null;
  if (location.booking_phone) {
    callLink = (
      <>
        Call{" "}
        <a
          className="location-info--booking-phone"
          href={`tel:${location.booking_phone}`}
        >
          {location.booking_phone}
        </a>
      </>
    );
  }

  return (
    <div className="location-info--booking">
      {bookingLink}
      {bookingLink && callLink ? " or " : ""}
      {callLink}
    </div>
  );
}
