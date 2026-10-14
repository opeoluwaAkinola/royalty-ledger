package com.royaltyledger.royalty.calc;

/** A rights holder's share of a track, in basis points (10000 = 100%). */
public record Split(long holderId, int shareBps) {}
