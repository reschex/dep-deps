package com.example;

public class Service {
    private Repository repository;

    public Service(Repository repository) {
        this.repository = repository;
    }

    public void processOrder(String orderId) {
        if (orderId != null) {
            repository.save(orderId);
        } else {
            throw new IllegalArgumentException("null orderId");
        }
    }

    public void validateOrder(String orderId) {
        if (orderId == null || orderId.isEmpty()) {
            throw new IllegalArgumentException("invalid");
        }
    }
}
