package com.example;

public class Repository {
    private Util util;

    public void save(String id) {
        if (id != null) {
            String formatted = util.format(id);
            System.out.println(formatted);
        } else {
            throw new IllegalArgumentException("null id");
        }
    }

    public void delete(String id) {
        if (id != null) {
            util.format(id);
        }
    }
}
