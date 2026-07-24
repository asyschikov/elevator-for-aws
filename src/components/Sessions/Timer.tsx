// Copyright (c) 2026 Andrey Syschikov
// SPDX-License-Identifier: MIT
// Portions derived from the AWS TEAM sample (MIT-0):
// https://github.com/aws-samples/iam-identity-center-team
import React, { useState, useEffect } from "react";
import Box from "@cloudscape-design/components/box";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0h:00m:00s";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h:${String(minutes).padStart(2, "0")}m:${String(seconds).padStart(2, "0")}s`;
}

function Countdown({ title, value }: { title: string; value: number }) {
  const [remaining, setRemaining] = useState(value - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(value - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [value]);

  return (
    <div>
      <Box color="inherit" fontSize="body-m">{title}</Box>
      <Box fontSize="heading-m" fontWeight="bold">{formatCountdown(remaining)}</Box>
    </div>
  );
}

function Timer(props) {
  const startTime = Date.parse(props.item.startTime);
  const createTime = Date.parse(props.item.createdAt);
  if (props.item.status === "scheduled") {
    return <Countdown title="Elevated access starts in" value={startTime} />;
  } else if (props.item.sessionStatus === "in-progress") {
    const ends = startTime + props.item.duration * 60 * 60 * 1000;
    return <Countdown title="Elevated access ends in" value={ends} />;
  } else if (props.item.status === "pending") {
    const expires = createTime + 60 * 60 * 1000 * props.expiry;
    return <Countdown title="Request expires in" value={expires} />;
  } else return null;
}

export default Timer;
