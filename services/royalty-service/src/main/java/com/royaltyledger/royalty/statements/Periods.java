package com.royaltyledger.royalty.statements;

import java.util.regex.Pattern;

public final class Periods {
    private static final Pattern PERIOD = Pattern.compile("^\\d{4}-(0[1-9]|1[0-2])$");

    private Periods() {}

    public static String require(String period) {
        if (period == null || !PERIOD.matcher(period).matches()) {
            throw new IllegalArgumentException("period must look like 2026-10");
        }
        return period;
    }
}
