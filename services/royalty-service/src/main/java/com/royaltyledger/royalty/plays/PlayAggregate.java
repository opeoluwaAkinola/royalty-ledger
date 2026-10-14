package com.royaltyledger.royalty.plays;

/** Plays of one track in one territory on one tier, for one period, as counted by the pipeline. */
public record PlayAggregate(String isrc, String territory, String tier, long streams, long plays) {}
